import html
import logging
import os
import re
import unicodedata
from typing import Optional
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)
router = APIRouter(tags=["documents"])

TIKA_URL = os.getenv("TIKA_URL", "http://tika:9998")

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
}


def _normalize_text(text: str) -> str:
    """Clean up raw text extracted from documents."""
    # Decode any residual HTML entities (e.g. from HTML-embedded content)
    text = html.unescape(text)
    # PDF page-break character → paragraph break
    text = text.replace('\x0c', '\n\n')
    # Non-breaking space → regular space
    text = text.replace('\xa0', ' ').replace(' ', ' ')
    # Soft hyphen (PDF line-break artifact) → nothing
    text = text.replace('\xad', '').replace('­', '')
    # BOM and zero-width characters
    text = re.sub(r'[﻿​‌‍⁠]', '', text)
    # Other control characters (keep \n, \r, \t)
    text = re.sub(r'[\x00-\x08\x0b\x0e-\x1f\x7f]', '', text)
    # Null bytes
    text = text.replace('\x00', '')
    # Normalize Unicode to NFC (canonical form — fixes decomposed accents)
    text = unicodedata.normalize('NFC', text)
    # Collapse runs of spaces/tabs within lines
    lines = [re.sub(r'[ \t]+', ' ', line).rstrip() for line in text.splitlines()]
    # Collapse runs of 3+ blank lines down to 2
    text = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines))
    return text.strip()


async def _tika_extract(content: bytes, content_type: str) -> tuple[str, dict]:
    """Call Tika server to extract text and metadata."""
    text = ""
    metadata: dict = {}

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            text_resp = await client.put(
                f"{TIKA_URL}/tika",
                content=content,
                headers={"Content-Type": content_type, "Accept": "text/plain"},
            )
            if text_resp.status_code == 200:
                # Decode explicitly as UTF-8 — never trust the server's charset claim
                raw = text_resp.content.decode("utf-8", errors="replace")
                text = _normalize_text(raw)
        except Exception as e:
            logger.warning(f"Tika text extraction failed: {e}")

        try:
            meta_resp = await client.put(
                f"{TIKA_URL}/meta",
                content=content,
                headers={"Content-Type": content_type, "Accept": "application/json"},
            )
            if meta_resp.status_code == 200:
                metadata = meta_resp.json()
        except Exception as e:
            logger.warning(f"Tika metadata extraction failed: {e}")

    return text, metadata


def _ocr_pdf(content: bytes) -> str:
    """Tesseract OCR fallback for scanned PDFs."""
    try:
        from pdf2image import convert_from_bytes
        import pytesseract

        images = convert_from_bytes(content, dpi=200)
        pages = [pytesseract.image_to_string(img, lang="eng+fra") for img in images]
        raw = "\n\n".join(p.strip() for p in pages if p.strip())
        return _normalize_text(raw)
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        return ""


def _parse_metadata(raw: dict) -> dict:
    """Normalise Tika metadata keys to our schema fields."""
    def first(*keys):
        for k in keys:
            v = raw.get(k)
            if isinstance(v, list):
                v = v[0]
            if v:
                return str(v)
        return None

    page_count: Optional[int] = None
    for k in ("xmpTPg:NPages", "meta:page-count", "Page-Count"):
        v = raw.get(k)
        if isinstance(v, list):
            v = v[0]
        if v is not None:
            try:
                page_count = int(v)
                break
            except (ValueError, TypeError):
                pass

    return {
        "title": first("dc:title", "title", "pdf:title"),
        "author": first("dc:creator", "meta:author", "Author", "creator"),
        "language": first("dc:language", "language"),
        "pageCount": page_count,
    }


@router.post("/extract")
async def extract_document(request: Request):
    """
    Extract text and metadata from a document sent as raw bytes.
    Expects:
      Content-Type: <mime type of the document>
      X-Filename:   <URL-encoded original filename>
    """
    content_type = request.headers.get("content-type", "application/octet-stream")
    filename = unquote(request.headers.get("x-filename", "document"))

    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {content_type}",
        )

    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file body")

    text, raw_meta = await _tika_extract(content, content_type)

    # OCR fallback for scanned PDFs
    if not text and content_type == "application/pdf":
        logger.info(f"Tika returned empty text for '{filename}', running OCR")
        text = _ocr_pdf(content)

    metadata = _parse_metadata(raw_meta)

    return {
        "text": text,
        "title": metadata["title"],
        "author": metadata["author"],
        "language": metadata["language"],
        "pageCount": metadata["pageCount"],
    }
