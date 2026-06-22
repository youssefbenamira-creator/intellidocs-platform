import json
import logging
import os
import re
from collections import Counter
from functools import lru_cache
from typing import Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nlp", tags=["nlp"])

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
LLM_MODEL  = os.getenv("LLM_MODEL",  "qwen3:4b-instruct")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Language-specific summarization models
SUMMARIZER_MODELS: dict[str, str] = {
    "fr": "moussaKam/barthez-orangesum-abstract",  # French BART (OrangeSum)
    "en": "sshleifer/distilbart-cnn-12-6",          # English DistilBART (CNN/DM)
}

SUMMARY_CHUNK_WORDS  = 700   # max words per summarisation chunk
SUMMARY_CHUNK_OVERLAP = 50   # word overlap between chunks
SUMMARY_MAX_CHUNKS   = 5     # map phase: at most 5 chunks
SUMMARY_MIN_WORDS    = 60    # don't summarise very short texts

NER_CHUNK_WORDS  = 400       # NER window size in words
NER_OVERLAP_WORDS = 50       # word overlap between NER windows
NER_MAX_WORDS    = 6000      # process at most this many words for NER

KEYWORD_TOP_N = 20

# Table extraction (LLM-driven)
TABLE_NUM_CTX      = 8192   # context window: fits a chunk + prompt + JSON output
TABLE_NUM_PREDICT  = 1024   # cap on generated JSON length (bounds per-call latency)
TABLE_MAX_TABLES   = 6      # keep at most this many tables per document
TABLE_MAX_ROWS     = 60     # keep at most this many rows per table
TABLE_MAX_COLUMNS  = 20     # cap on schema-guided column count
TABLE_CHUNK_WORDS  = 1800   # word window for whole-document (deep) extraction
TABLE_CHUNK_OVERLAP = 120   # word overlap between windows
TABLE_MAX_CHUNKS   = 3      # cap windows to bound latency on local hardware

# Free-form extraction: the model chooses the columns from the content.
TABLE_SYSTEM_PROMPT = (
    "You turn a document's key information into tables. "
    "Choose columns dynamically from what THIS document actually contains — "
    "different documents will have different columns. "
    "Pull out concrete information: measurements, results, statistics, comparisons, "
    "specifications, parameters, and key entities with their attributes — even when "
    "the document states them in sentences rather than an existing table. "
    "Always produce at least one table summarising the document's key facts when any "
    "concrete data is present. "
    "Use ONLY information found in the document; never invent or guess values — if a "
    "value is not stated, leave that cell empty. Keep cell values short. "
    "Return a JSON array of tables, each "
    '{"title": "<short title>", "columns": ["c1","c2",...], "rows": [["v1","v2",...], ...]}. '
    "Every row must have exactly as many cells as there are columns. "
    "Here is one short example of the expected style:\n"
    '[{"title":"Measurements","columns":["Sample","Temperature","Yield"],'
    '"rows":[["A","25C","82%"],["B","40C",""]]}].\n'
    "If the document has genuinely no concrete data, return []."
)

# Schema-guided extraction: the columns are FIXED (template or manual entry).
TABLE_SCHEMA_SYSTEM_PROMPT = (
    "You extract structured data from a document into a table whose columns are FIXED "
    "and given to you. For every distinct record, entity, or measurement the document "
    "describes, output one row. Each row is an object whose keys are EXACTLY the given "
    "columns. Use ONLY information present in the document; if a column's value is not "
    "stated for a record, use an empty string. Never invent or guess values. "
    "Keep cell values short. Return JSON of the form "
    '{"rows": [ {"<col>": "<value>", ...}, ... ]}.'
)

# JSON schema enforcing the free-form table shape (Ollama structured outputs).
FREEFORM_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "title":   {"type": "string"},
            "columns": {"type": "array", "items": {"type": "string"}},
            "rows":    {"type": "array", "items": {"type": "array", "items": {"type": "string"}}},
        },
        "required": ["title", "columns", "rows"],
    },
}

# Minimal English + French stopwords
_STOPWORDS = {
    "the","a","an","and","or","but","in","on","at","to","for","of","with",
    "by","from","as","is","was","are","were","be","been","being","have",
    "has","had","do","does","did","will","would","could","should","may",
    "might","shall","can","that","this","these","those","it","its","we",
    "our","they","their","he","she","his","her","you","your","i","my","me",
    "us","not","no","so","if","then","than","such","other","also","which",
    "who","what","when","where","how","all","each","more","most","any",
    "some","into","through","about","between","after","before","during",
    "le","la","les","un","une","des","et","ou","mais","donc","or","ni",
    "car","ce","cet","cette","ces","se","sa","son","ses","mon","ma","mes",
    "ton","ta","tes","nous","vous","ils","elles","en","au","aux","du","de",
    "que","qui","quoi","dont","avec","pour","par","sur","sous","dans",
    "est","sont","avoir","être","pas","plus","très","aussi","comme","si",
    "tout","même","lui","leur","leurs","aux","eux","sans","vers","lors",
    "après","avant","depuis","pendant","selon","entre","contre","chez",
    "its","was","has","been","will","been","were","can","into","than",
    "about","other","after","first","last","such","then","well","also",
    "just","more","some","any","all","but","not","and","for","are",
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class NLPRequest(BaseModel):
    text: str
    language: Optional[str] = "en"
    # When provided, tables are extracted against this fixed column set
    # (template or manual columns) instead of free-form dynamic columns.
    table_columns: Optional[list[str]] = None


class TablesRequest(BaseModel):
    text: str
    language: Optional[str] = "en"
    columns: Optional[list[str]] = None


class Entity(BaseModel):
    text: str
    label: str
    start: int
    end: int


class Table(BaseModel):
    title: str
    columns: list[str]
    rows: list[list[str]]


class NLPResponse(BaseModel):
    summary: Optional[str]
    entities: list[Entity]
    keywords: list[str]
    tables: list[Table] = []


# ---------------------------------------------------------------------------
# Lazy model loaders
# ---------------------------------------------------------------------------

@lru_cache(maxsize=4)
def _get_summarizer(lang: str):
    from transformers import pipeline
    model = SUMMARIZER_MODELS.get(lang, SUMMARIZER_MODELS["en"])
    logger.info(f"Loading summarisation model: {model}")
    return pipeline("summarization", model=model, device=-1)


@lru_cache(maxsize=1)
def _get_ner():
    from transformers import pipeline
    logger.info("Loading NER model: Davlan/distilbert-base-multilingual-cased-ner-hrl")
    return pipeline(
        "token-classification",
        model="Davlan/distilbert-base-multilingual-cased-ner-hrl",
        aggregation_strategy="simple",
        device=-1,
    )


# ---------------------------------------------------------------------------
# Summarisation — language-aware + map-reduce for long documents
# ---------------------------------------------------------------------------

def _summarize_chunk(chunk: str, lang: str) -> Optional[str]:
    """Summarise a single chunk (≤ SUMMARY_CHUNK_WORDS words)."""
    words = chunk.split()
    if len(words) < SUMMARY_MIN_WORDS:
        return chunk if len(words) >= 10 else None
    truncated = " ".join(words[:SUMMARY_CHUNK_WORDS])
    try:
        result = _get_summarizer(lang)(
            truncated,
            max_length=160,
            min_length=30,
            do_sample=False,
            truncation=True,
        )
        return result[0]["summary_text"]
    except Exception as e:
        logger.error(f"Chunk summarisation failed ({lang}): {e}")
        return None


def _summarize(text: str, lang: str) -> Optional[str]:
    words = text.split()
    if len(words) < SUMMARY_MIN_WORDS:
        return None

    # Short document: direct summarisation
    if len(words) <= SUMMARY_CHUNK_WORDS:
        return _summarize_chunk(text, lang)

    # Long document: map phase — summarise up to SUMMARY_MAX_CHUNKS chunks
    step = SUMMARY_CHUNK_WORDS - SUMMARY_CHUNK_OVERLAP
    chunks = [
        " ".join(words[i: i + SUMMARY_CHUNK_WORDS])
        for i in range(0, min(len(words), step * SUMMARY_MAX_CHUNKS), step)
    ]
    chunk_summaries = [s for c in chunks if (s := _summarize_chunk(c, lang))]

    if not chunk_summaries:
        return None
    if len(chunk_summaries) == 1:
        return chunk_summaries[0]

    # Reduce phase — combine chunk summaries
    combined = " ".join(chunk_summaries)
    if len(combined.split()) <= SUMMARY_CHUNK_WORDS:
        return combined
    return _summarize_chunk(combined, lang) or combined


# ---------------------------------------------------------------------------
# NER — chunked across the full document
# ---------------------------------------------------------------------------

def _extract_entities(text: str) -> list[dict]:
    words = text.split()
    seen: set[tuple[str, str]] = set()
    entities: list[dict] = []

    step = NER_CHUNK_WORDS - NER_OVERLAP_WORDS
    char_cursor = 0

    for i in range(0, min(len(words), NER_MAX_WORDS), step):
        chunk_words = words[i: i + NER_CHUNK_WORDS]
        chunk = " ".join(chunk_words)
        try:
            for item in _get_ner()(chunk):
                raw_text = item["word"].strip()
                # Filter subword artifacts and single-character tokens
                if raw_text.startswith("##") or len(raw_text) <= 1:
                    continue
                # Clean leading/trailing punctuation (common in multilingual tokenizers)
                clean = re.sub(r'^[^\wÀ-ɏ]+|[^\wÀ-ɏ]+$', '', raw_text)
                if not clean:
                    continue
                key = (clean.lower(), item["entity_group"])
                if key not in seen:
                    seen.add(key)
                    entities.append({
                        "text":  clean,
                        "label": item["entity_group"],
                        "start": char_cursor + int(item["start"]),
                        "end":   char_cursor + int(item["end"]),
                    })
        except Exception as e:
            logger.error(f"NER chunk {i} failed: {e}")

        char_cursor += len(chunk) + 1

    return entities


# ---------------------------------------------------------------------------
# Keywords — TF-IDF approximation with bigrams + position weighting
# ---------------------------------------------------------------------------

def _extract_keywords(text: str) -> list[str]:
    # Tokenise: covers French accented chars
    all_tokens = re.findall(r'\b[a-zA-ZÀ-ɏ]{3,}\b', text.lower())
    filtered = [t for t in all_tokens if t not in _STOPWORDS]
    if not filtered:
        return []

    total = len(filtered)
    # Position weight: tokens in first quarter of document score 1.5×
    cutoff = max(1, total // 4)

    scores: dict[str, float] = {}

    # Unigrams
    for idx, tok in enumerate(filtered):
        w = 1.5 if idx < cutoff else 1.0
        scores[tok] = scores.get(tok, 0.0) + w

    # Bigrams (2-word phrases — more informative, get 2× weight)
    for idx in range(len(filtered) - 1):
        a, b = filtered[idx], filtered[idx + 1]
        if len(a) > 3 and len(b) > 3:
            bg = f"{a} {b}"
            w = (1.5 if idx < cutoff else 1.0) * 2.0
            scores[bg] = scores.get(bg, 0.0) + w

    # Normalise by document length and sort
    normalised = {k: v / total for k, v in scores.items()}
    return sorted(normalised, key=lambda k: normalised[k], reverse=True)[:KEYWORD_TOP_N]


# ---------------------------------------------------------------------------
# Table extraction — LLM-driven, dynamic columns per document
# ---------------------------------------------------------------------------

def _coerce_tables(data) -> list[dict]:
    """Validate and normalise the model's JSON into well-formed tables."""
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for t in data[:TABLE_MAX_TABLES]:
        if not isinstance(t, dict):
            continue
        cols = t.get("columns")
        rows = t.get("rows")
        if not isinstance(cols, list) or not isinstance(rows, list) or not cols:
            continue
        cols = [str(c).strip() for c in cols]
        ncol = len(cols)
        clean_rows: list[list[str]] = []
        for r in rows[:TABLE_MAX_ROWS]:
            if not isinstance(r, list):
                continue
            cells = [("" if c is None else str(c)).strip() for c in r]
            # Pad or trim each row to match the column count
            if len(cells) < ncol:
                cells += [""] * (ncol - len(cells))
            elif len(cells) > ncol:
                cells = cells[:ncol]
            if any(cells):
                clean_rows.append(cells)
        if clean_rows:
            out.append({
                "title": str(t.get("title", "")).strip() or "Extracted data",
                "columns": cols,
                "rows": clean_rows,
            })
    return out


def _parse_json_tables(raw: str) -> list[dict]:
    """Best-effort extraction of a JSON array from the model's raw output (fallback)."""
    if not raw:
        return []
    text = raw.strip()
    text = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end != -1 and end > start:
        text = text[start:end + 1]
    try:
        return _coerce_tables(json.loads(text))
    except Exception as e:
        logger.warning(f"Table JSON parse failed: {e}")
        return []


def _ollama_table_call(messages: list[dict], fmt) -> Optional[str]:
    """Single structured-output call to the local LLM; returns the content or None."""
    try:
        resp = httpx.post(
            f"{OLLAMA_URL}/api/chat",
            timeout=300.0,
            json={
                "model": LLM_MODEL,
                "stream": False,
                "think": False,
                "format": fmt,  # Ollama structured outputs: constrain to this JSON schema
                "options": {
                    "num_ctx": TABLE_NUM_CTX,
                    "num_predict": TABLE_NUM_PREDICT,
                    "temperature": 0,
                },
                "messages": messages,
            },
        )
        if resp.status_code != 200:
            logger.warning(f"Table LLM returned {resp.status_code}: {resp.text[:160]}")
            return None
        return resp.json().get("message", {}).get("content", "")
    except Exception as e:
        logger.error(f"Table LLM call failed: {e}")
        return None


def _table_chunks(text: str) -> list[str]:
    """Split the document into overlapping windows for whole-document extraction."""
    words = text.split()
    if not words:
        return []
    if len(words) <= TABLE_CHUNK_WORDS:
        return [" ".join(words)]
    step = max(1, TABLE_CHUNK_WORDS - TABLE_CHUNK_OVERLAP)
    chunks = [" ".join(words[i:i + TABLE_CHUNK_WORDS]) for i in range(0, len(words), step)]
    return chunks[:TABLE_MAX_CHUNKS]


def _merge_freeform(per_chunk: list[list[dict]]) -> list[dict]:
    """Merge per-chunk free-form tables by column signature, deduplicating rows."""
    merged: dict[tuple, dict] = {}
    order: list[tuple] = []
    for tables in per_chunk:
        for t in tables:
            sig = tuple(c.lower() for c in t["columns"])
            if sig not in merged:
                merged[sig] = {"title": t["title"], "columns": t["columns"], "rows": [], "seen": set()}
                order.append(sig)
            m = merged[sig]
            for r in t["rows"]:
                key = tuple(c.lower() for c in r)
                if key not in m["seen"]:
                    m["seen"].add(key)
                    m["rows"].append(r)
    return [
        {"title": merged[s]["title"], "columns": merged[s]["columns"], "rows": merged[s]["rows"][:TABLE_MAX_ROWS]}
        for s in order[:TABLE_MAX_TABLES]
    ]


def _schema_for_columns(columns: list[str]) -> dict:
    """Build a JSON schema forcing each row to be an object with exactly these columns."""
    props = {c: {"type": "string"} for c in columns}
    return {
        "type": "object",
        "properties": {
            "rows": {
                "type": "array",
                "items": {"type": "object", "properties": props, "required": columns},
            }
        },
        "required": ["rows"],
    }


def _rows_from_objects(content: Optional[str], columns: list[str]) -> list[list[str]]:
    """Convert the schema-guided JSON ({"rows":[{col:val}]}) into ordered row arrays."""
    if not content:
        return []
    try:
        data = json.loads(content)
    except Exception:
        return []
    rows = data.get("rows") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []
    out: list[list[str]] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        cells = [("" if r.get(c) is None else str(r.get(c))).strip() for c in columns]
        if any(cells):
            out.append(cells)
    return out


def extract_with_schema(text: str, columns: list[str], lang: str = "en") -> list[dict]:
    """Schema-guided extraction: fill a FIXED set of columns from the whole document."""
    columns = [str(c).strip() for c in columns if str(c).strip()][:TABLE_MAX_COLUMNS]
    if not columns or not text or not text.strip():
        return []
    fmt = _schema_for_columns(columns)
    col_list = ", ".join(columns)
    all_rows: list[list[str]] = []
    seen: set[tuple] = set()
    for chunk in _table_chunks(text):
        content = _ollama_table_call(
            [
                {"role": "system", "content": TABLE_SCHEMA_SYSTEM_PROMPT},
                {"role": "user", "content":
                    f"Columns: {' | '.join(columns)}\n\nDocument:\n\n{chunk}\n\n"
                    f"Return JSON {{\"rows\": [...]}} where each row is an object with exactly these keys: {col_list}."},
            ],
            fmt,
        )
        for row in _rows_from_objects(content, columns):
            key = tuple(c.lower() for c in row)
            if key in seen:
                continue
            seen.add(key)
            all_rows.append(row)
            if len(all_rows) >= TABLE_MAX_ROWS:
                break
        if len(all_rows) >= TABLE_MAX_ROWS:
            break
    if not all_rows:
        return []
    return [{"title": "Extracted data", "columns": columns, "rows": all_rows}]


def extract_tables(text: str, lang: str = "en", columns: Optional[list[str]] = None) -> list[dict]:
    """
    Arrange a document's data into tables.
      - columns given  → schema-guided extraction over the whole document (fixed columns);
      - columns absent → free-form extraction, where the model chooses the columns.
    Both run over the full document (chunked) for higher recall.
    """
    if not text or not text.strip():
        return []
    if len(text.split()) < 30:
        return []
    if columns:
        return extract_with_schema(text, columns, lang)

    per_chunk: list[list[dict]] = []
    for chunk in _table_chunks(text):
        content = _ollama_table_call(
            [
                {"role": "system", "content": TABLE_SYSTEM_PROMPT},
                {"role": "user", "content": f"Document:\n\n{chunk}\n\nExtract the tables as a JSON array."},
            ],
            FREEFORM_SCHEMA,
        )
        tables: list[dict] = []
        if content:
            try:
                tables = _coerce_tables(json.loads(content))
            except Exception:
                tables = _parse_json_tables(content)
        per_chunk.append(tables)
    return _merge_freeform(per_chunk)


# ---------------------------------------------------------------------------
# Public endpoint
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=NLPResponse)
async def analyze(req: NLPRequest):
    if not req.text or not req.text.strip():
        return NLPResponse(summary=None, entities=[], keywords=[], tables=[])

    lang = (req.language or "en")[:2].lower()
    # Map language codes that differ from our two model keys
    if lang not in SUMMARIZER_MODELS:
        lang = "en"

    summary  = _summarize(req.text, lang)
    entities = _extract_entities(req.text)
    keywords = _extract_keywords(req.text)

    # Table extraction is intentionally NOT run here: it is the slow, LLM-driven
    # stage and is computed separately (via /nlp/tables) so that ingestion stays
    # responsive. Callers patch the document's tables once extraction completes.
    return NLPResponse(
        summary=summary,
        entities=[Entity(**e) for e in entities],
        keywords=keywords,
        tables=[],
    )


@router.post("/tables")
async def tables(req: TablesRequest):
    """Extract only tables, optionally against a fixed column set (template/manual)."""
    lang = (req.language or "en")[:2].lower()
    if lang not in SUMMARIZER_MODELS:
        lang = "en"
    return {"tables": extract_tables(req.text, lang, columns=req.columns)}
