import asyncio
import html as html_lib
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import List, Optional

import httpx

from routers.nlp import _summarize, _extract_entities, _extract_keywords, extract_tables
from search_utils import index_document as search_index

NESTJS_URL = os.getenv("NESTJS_URL", "http://backend:3001")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")


def _sync_explorer(job_id: int) -> None:
    """Ask NestJS to register this job's crawled pages as explorer assets."""
    try:
        httpx.post(
            f"{NESTJS_URL}/explorer/internal/scraped-sync",
            headers={"x-internal-key": INTERNAL_API_KEY},
            json={"jobId": job_id},
            timeout=30.0,
        )
    except Exception as e:  # best-effort — never fail the crawl over this
        logging.getLogger(__name__).warning(f"Explorer sync failed for job {job_id}: {e}")

from playwright.async_api import async_playwright
from sqlalchemy.orm import Session

from models import ScrapingJob, ScrapingResult, ScrapedDocument, ScrapingStatus

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# CoinMarketCap scraper (legacy, preserved)
# ─────────────────────────────────────────────

COIN_ALIASES = {
    "bitcoin": "bitcoin", "btc": "bitcoin",
    "ethereum": "ethereum", "eth": "ethereum",
    "solana": "solana", "sol": "solana",
    "binancecoin": "bnb", "bnb": "bnb",
    "xrp": "xrp", "ripple": "xrp",
    "cardano": "cardano", "ada": "cardano",
    "dogecoin": "dogecoin", "doge": "dogecoin",
    "avalanche": "avalanche", "avax": "avalanche",
    "polkadot": "polkadot", "dot": "polkadot",
    "chainlink": "chainlink", "link": "chainlink",
}


async def scrape_coinmarketcap(target_coins: List[str], attributes: List[str]) -> List[dict]:
    """Scrape CoinMarketCap for the requested coins and attributes."""
    results = []
    target_lower = [c.lower() for c in target_coins]

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        page = await browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
        )

        try:
            for page_num in range(1, 4):
                url = f"https://coinmarketcap.com/?page={page_num}"
                await page.goto(url, wait_until="networkidle", timeout=60000)
                await page.wait_for_selector("table tbody tr", timeout=30000)

                rows = await page.query_selector_all("table tbody tr")

                for row in rows:
                    try:
                        cells = await row.query_selector_all("td")
                        if len(cells) < 7:
                            continue

                        name_el = await row.query_selector("p.coin-item-name")
                        symbol_el = await row.query_selector("p.coin-item-symbol")

                        if not name_el or not symbol_el:
                            continue

                        coin_name = (await name_el.inner_text()).strip().lower()
                        coin_symbol = (await symbol_el.inner_text()).strip().lower()

                        matched = None
                        for t in target_lower:
                            if t == coin_name or t == coin_symbol or t in coin_name:
                                matched = t
                                break

                        if matched is None:
                            continue

                        data = {"coin": coin_name.title()}

                        def parse_money(s):
                            m = re.search(r'\$([\d,]+\.?\d*)', s)
                            if m:
                                return float(m.group(1).replace(',', ''))
                            return None

                        def parse_supply(s):
                            m = re.search(r'([\d,]+\.?\d*)\s*([KkMmBbTt]?)', s)
                            if m:
                                val = float(m.group(1).replace(',', ''))
                                mult = m.group(2).upper()
                                if mult == 'K': val *= 1e3
                                elif mult == 'M': val *= 1e6
                                elif mult == 'B': val *= 1e9
                                elif mult == 'T': val *= 1e12
                                return val
                            return None

                        if "rank" in attributes:
                            try:
                                rank_text = await cells[1].inner_text()
                                match = re.search(r'\d+', rank_text)
                                data["rank"] = int(match.group(0)) if match else None
                            except Exception:
                                data["rank"] = None

                        if "price" in attributes:
                            try:
                                data["price"] = parse_money(await cells[3].inner_text())
                            except Exception:
                                data["price"] = None

                        if "percentChange24h" in attributes:
                            try:
                                change_html = await cells[5].inner_html()
                                is_neg = "icon-Caret-down" in change_html
                                match = re.search(r'([\d,]+\.?\d*)', await cells[5].inner_text())
                                if match:
                                    val = float(match.group(1).replace(',', ''))
                                    data["percentChange24h"] = -val if is_neg else val
                                else:
                                    data["percentChange24h"] = None
                            except Exception:
                                data["percentChange24h"] = None

                        if "marketCap" in attributes:
                            try:
                                data["marketCap"] = parse_money(await cells[7].inner_text())
                            except Exception:
                                data["marketCap"] = None

                        if "volume24h" in attributes:
                            try:
                                data["volume24h"] = parse_money(await cells[8].inner_text())
                            except Exception:
                                data["volume24h"] = None

                        if "circulatingSupply" in attributes:
                            try:
                                data["circulatingSupply"] = parse_supply(await cells[9].inner_text())
                            except Exception:
                                data["circulatingSupply"] = None

                        results.append(data)

                    except Exception as e:
                        logger.warning(f"Error parsing row: {e}")
                        continue

                found_names = {r["coin"].lower() for r in results}
                if all(any(t in n for n in found_names) for t in target_lower):
                    break

        finally:
            await browser.close()

    return results


def run_scraping_job(job_id: int, target_coins: List[str], attributes: List[str], db: Session):
    """Synchronous wrapper for CoinMarketCap jobs, called by APScheduler."""
    logger.info(f"Running CMC scraping job {job_id} for coins: {target_coins}")
    job = db.query(ScrapingJob).filter(ScrapingJob.id == job_id).first()
    if not job or job.status == ScrapingStatus.PAUSED:
        return

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        scraped = loop.run_until_complete(
            scrape_coinmarketcap(target_coins, attributes)
        )
        loop.close()

        now = datetime.now(timezone.utc)
        for item in scraped:
            result = ScrapingResult(
                jobId=job_id,
                coin=item.get("coin", "Unknown"),
                rank=item.get("rank"),
                price=item.get("price"),
                marketCap=item.get("marketCap"),
                volume24h=item.get("volume24h"),
                percentChange24h=item.get("percentChange24h"),
                circulatingSupply=item.get("circulatingSupply"),
                scrapedAt=now,
            )
            db.add(result)

        job.lastRunAt = now
        if job.mode.value == "ONE_TIME":
            job.status = ScrapingStatus.COMPLETED
        db.commit()
        logger.info(f"CMC job {job_id} completed, {len(scraped)} results saved.")

    except Exception as e:
        logger.error(f"CMC job {job_id} failed: {e}")
        job = db.query(ScrapingJob).filter(ScrapingJob.id == job_id).first()
        if job:
            job.status = ScrapingStatus.FAILED
            db.commit()
    finally:
        db.close()


# ─────────────────────────────────────────────
# Generic URL scraper
# ─────────────────────────────────────────────

def _clean_text(text: str) -> str:
    # Decode HTML entities that may survive Playwright's inner_text()
    text = html_lib.unescape(text)
    # Non-breaking spaces and special whitespace variants → regular space
    text = text.replace('\xa0', ' ').replace(' ', ' ')
    # Soft hyphens, BOM, zero-width characters
    text = text.replace('\xad', '').replace('­', '')
    text = re.sub(r'[﻿​‌‍⁠]', '', text)
    # Other control characters (keep \n, \r, \t)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    # Normalize Unicode to NFC
    text = unicodedata.normalize('NFC', text)
    # Collapse spaces/tabs within lines; collapse excess blank lines
    lines = [re.sub(r'[ \t]+', ' ', line).rstrip() for line in text.splitlines()]
    text = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines))
    return text.strip()


async def scrape_url(url: str) -> dict:
    """Generic URL scraper: extracts title, meta description, headings, and main text."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        page = await browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
        )

        try:
            await page.goto(url, wait_until="networkidle", timeout=60000)

            title = await page.title()

            description: Optional[str] = None
            for selector in ['meta[name="description"]', 'meta[property="og:description"]']:
                try:
                    el = await page.query_selector(selector)
                    if el:
                        description = await el.get_attribute("content")
                        if description:
                            break
                except Exception:
                    pass

            headings: List[str] = []
            for tag in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                try:
                    elements = await page.query_selector_all(tag)
                    for el in elements:
                        text = (await el.inner_text()).strip()
                        if text:
                            headings.append(f"[{tag.upper()}] {text}")
                except Exception:
                    pass

            body_text = ""
            for selector in ["main", "article", '[role="main"]', "#content", ".content", "body"]:
                try:
                    el = await page.query_selector(selector)
                    if el:
                        text = (await el.inner_text()).strip()
                        if len(text) > 200:
                            body_text = text
                            break
                except Exception:
                    pass

            content = _clean_text("\n".join(headings) + "\n\n" + body_text)

            return {
                "url": url,
                "title": title or "",
                "description": description or "",
                "content": content,
            }

        finally:
            await browser.close()


def _detect_language(text: str) -> str:
    """Detect language code from text, default to 'en'."""
    try:
        from langdetect import detect, DetectorFactory
        DetectorFactory.seed = 0
        return detect(text[:3000])[:2].lower()
    except Exception:
        return "en"


def run_url_scraping_job(job_id: int, url: str, db: Session):
    """Synchronous wrapper for generic URL jobs, called by APScheduler."""
    logger.info(f"Running URL scraping job {job_id} for: {url}")
    job = db.query(ScrapingJob).filter(ScrapingJob.id == job_id).first()
    if not job or job.status == ScrapingStatus.PAUSED:
        return

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(scrape_url(url))
        loop.close()

        content = result.get("content", "")

        # Table-extraction schema applied to this crawl (template / manual columns)
        job_columns = list(job.tableColumns) if job.tableColumns else None

        # Run NLP analysis
        nlp_summary = None
        nlp_entities = []
        nlp_keywords = []
        nlp_tables = []
        if content.strip():
            try:
                lang = _detect_language(content)
                nlp_summary   = _summarize(content, lang)
                nlp_entities  = _extract_entities(content)
                nlp_keywords  = _extract_keywords(content)
                nlp_tables    = extract_tables(content, lang, columns=job_columns)
                logger.info(f"NLP done for URL job {job_id} (lang={lang}, tables={len(nlp_tables)})")
            except Exception as e:
                logger.warning(f"NLP failed for URL job {job_id}: {e}")

        now = datetime.now(timezone.utc)
        doc = ScrapedDocument(
            jobId=job_id,
            url=result["url"],
            title=result.get("title"),
            description=result.get("description"),
            content=content,
            summary=nlp_summary,
            entities=nlp_entities if nlp_entities else None,
            keywords=nlp_keywords,
            tables=nlp_tables if nlp_tables else None,
            templateId=job.templateId,
            tableColumns=job.tableColumns or [],
            scrapedAt=now,
        )
        db.add(doc)
        job.lastRunAt = now
        if job.mode.value == "ONE_TIME":
            job.status = ScrapingStatus.COMPLETED
        db.commit()
        db.refresh(doc)

        # Index in Qdrant for semantic search
        try:
            search_index(
                doc_id=doc.id,
                doc_type="scraped",
                text=content,
                title=result.get("title"),
                url=result["url"],
            )
        except Exception as e:
            logger.warning(f"Search indexing skipped for URL job {job_id}: {e}")

        # Register the crawled page in the explorer (SCRAPED_SITE → SCRAPED_PAGE,
        # re-crawls become versions). Best-effort, service-to-service call.
        _sync_explorer(job_id)

        logger.info(f"URL job {job_id} completed, document saved.")

    except Exception as e:
        logger.error(f"URL job {job_id} failed: {e}")
        job = db.query(ScrapingJob).filter(ScrapingJob.id == job_id).first()
        if job:
            job.status = ScrapingStatus.FAILED
            db.commit()
    finally:
        db.close()
