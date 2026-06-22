import logging
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter
from sqlalchemy import text

from database import SessionLocal
from models import ScrapedDocument

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])

_topics_cache: Optional[dict] = None
_topics_cache_time: Optional[datetime] = None
_CACHE_TTL = 3600


def _fetch_all_docs(db):
    scraped = db.query(ScrapedDocument).all()
    try:
        rows = db.execute(text(
            'SELECT id, title, keywords, entities, summary, content, "createdAt" FROM "UploadedDocument"'
        )).fetchall()
    except Exception as e:
        logger.warning(f"Could not query UploadedDocument: {e}")
        rows = []
    return scraped, rows


@router.get("/overview")
def get_overview():
    db = SessionLocal()
    try:
        scraped_docs, uploaded_rows = _fetch_all_docs(db)

        # --- keyword aggregation ---
        kw_counter: Counter = Counter()
        for doc in scraped_docs:
            if doc.keywords:
                kw_counter.update(doc.keywords)
        for row in uploaded_rows:
            if row.keywords:
                kw_counter.update(row.keywords)

        top_keywords = [{"word": w, "count": c} for w, c in kw_counter.most_common(20)]

        # --- entity aggregation ---
        ent_counter: Counter = Counter()
        for doc in scraped_docs:
            if doc.entities and isinstance(doc.entities, list):
                for e in doc.entities:
                    key = (e.get("text", ""), e.get("label", ""))
                    if key[0]:
                        ent_counter[key] += 1
        for row in uploaded_rows:
            if row.entities and isinstance(row.entities, list):
                for e in row.entities:
                    key = (e.get("text", ""), e.get("label", ""))
                    if key[0]:
                        ent_counter[key] += 1

        top_entities = [
            {"text": k[0], "label": k[1], "count": v}
            for k, v in ent_counter.most_common(40)
        ]

        # --- docs by week (last 8 weeks) ---
        now = datetime.now(timezone.utc)
        weeks: dict = {}
        labels = []
        for i in range(7, -1, -1):
            ws = now - timedelta(weeks=i + 1)
            label = ws.strftime("%b %d")
            labels.append((label, ws, now - timedelta(weeks=i)))
            weeks[label] = {"week": label, "uploaded": 0, "scraped": 0}

        def _bucket(dt):
            if dt is None:
                return
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            for label, ws, we in labels:
                if ws <= dt < we:
                    return label
            return None

        for row in uploaded_rows:
            b = _bucket(row.createdAt)
            if b:
                weeks[b]["uploaded"] += 1
        for doc in scraped_docs:
            b = _bucket(doc.scrapedAt)
            if b:
                weeks[b]["scraped"] += 1

        # --- language distribution ---
        lang_counts: Counter = Counter()
        try:
            from langdetect import detect
            sample = list(scraped_docs[:60]) + [
                type("_R", (), {"content": r.content})()
                for r in uploaded_rows[:60]
                if r.content
            ]
            for obj in sample:
                txt = getattr(obj, "content", "") or ""
                if len(txt) < 20:
                    continue
                try:
                    lang_counts[detect(txt[:300])] += 1
                except Exception:
                    pass
        except Exception:
            pass

        lang_dist: dict = {"fr": 0, "en": 0, "other": 0}
        for lang, cnt in lang_counts.items():
            if lang == "fr":
                lang_dist["fr"] += cnt
            elif lang == "en":
                lang_dist["en"] += cnt
            else:
                lang_dist["other"] += cnt

        language_distribution = [
            {"language": "French", "count": lang_dist["fr"]},
            {"language": "English", "count": lang_dist["en"]},
            {"language": "Other", "count": lang_dist["other"]},
        ]

        return {
            "total_uploaded": len(uploaded_rows),
            "total_scraped": len(scraped_docs),
            "total": len(uploaded_rows) + len(scraped_docs),
            "docs_by_week": list(weeks.values()),
            "language_distribution": language_distribution,
            "top_keywords": top_keywords,
            "top_entities": top_entities,
        }
    finally:
        db.close()


@router.post("/topics")
def get_topics(n_topics: int = 8):
    global _topics_cache, _topics_cache_time

    now = datetime.now(timezone.utc)
    if (
        _topics_cache is not None
        and _topics_cache_time is not None
        and (now - _topics_cache_time).total_seconds() < _CACHE_TTL
    ):
        return _topics_cache

    db = SessionLocal()
    try:
        scraped_docs, uploaded_rows = _fetch_all_docs(db)

        texts = []
        metas = []

        for doc in scraped_docs:
            body = doc.summary or (doc.content[:400] if doc.content else "")
            if body and len(body.strip()) > 50:
                texts.append(body.strip())
                metas.append(doc.title or doc.url or "Scraped doc")

        for row in uploaded_rows:
            body = row.summary or (row.content[:400] if row.content else "")
            if body and len(body.strip()) > 50:
                texts.append(body.strip())
                metas.append(row.title or "Uploaded doc")

        if len(texts) < 5:
            return {
                "topics": [],
                "total_docs_analyzed": len(texts),
                "message": "Not enough documents for topic modeling (need at least 5 with content)",
            }

        from bertopic import BERTopic
        from sentence_transformers import SentenceTransformer

        embedding_model = SentenceTransformer(
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
        nr = min(n_topics, max(2, len(texts) // 3))

        topic_model = BERTopic(
            embedding_model=embedding_model,
            nr_topics=nr,
            min_topic_size=2,
            verbose=False,
            calculate_probabilities=False,
        )

        topic_assignments, _ = topic_model.fit_transform(texts)

        result_topics = []
        for _, row_info in topic_model.get_topic_info().iterrows():
            tid = row_info["Topic"]
            if tid == -1:
                continue
            words_scores = topic_model.get_topic(tid) or []
            keywords = [w for w, _ in words_scores[:8]]
            indices = [i for i, t in enumerate(topic_assignments) if t == tid][:3]
            result_topics.append({
                "id": int(tid),
                "label": " / ".join(keywords[:3]) if keywords else f"Topic {tid}",
                "keywords": keywords,
                "doc_count": int(row_info.get("Count", len(indices))),
                "representative_docs": [metas[i] for i in indices],
            })

        result = {"topics": result_topics, "total_docs_analyzed": len(texts)}
        _topics_cache = result
        _topics_cache_time = now
        return result

    except Exception as e:
        logger.error(f"Topic modeling failed: {e}", exc_info=True)
        return {"topics": [], "error": str(e)}
    finally:
        db.close()
