"""
Hybrid Semantic Search — BGE-M3 + Qdrant + BGE-Reranker-v2

Dense + sparse:  BAAI/bge-m3 (1024-dim dense, learned lexical sparse) — one model, multilingual (en/fr)
Vector store:    Qdrant (named "dense" + "sparse" vectors per point)
Fusion:          Reciprocal Rank Fusion (RRF) over dense + sparse candidates
Rerank:          BAAI/bge-reranker-v2-m3 cross-encoder over the fused candidates

Documents are split into overlapping chunks; each chunk is its own Qdrant point.
Every point carries a `ref` payload ("{type}:{doc_id}") so retrieval can be scoped
to a caller's accessible documents via a Qdrant MatchAny filter (RBAC).
"""
import logging
import os
import uuid
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
COLLECTION = "documents"
DENSE_DIM  = 1024          # BGE-M3 dense output size

# Chunking
CHUNK_WORDS   = 280        # ~target words per chunk
CHUNK_OVERLAP = 50         # word overlap between consecutive chunks
MAX_CHUNKS    = 60         # cap per document (very long docs)

# Retrieval
RERANK_CANDIDATES = 30     # how many fused candidates to feed the reranker


# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _get_embedder():
    from FlagEmbedding import BGEM3FlagModel
    logger.info("Loading embedding model: BAAI/bge-m3")
    # CPU inference — fp16 is GPU-only; keep fp32 on CPU
    return BGEM3FlagModel("BAAI/bge-m3", use_fp16=False)


@lru_cache(maxsize=1)
def _get_reranker():
    from FlagEmbedding import FlagReranker
    logger.info("Loading reranker: BAAI/bge-reranker-v2-m3")
    return FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=False)


@lru_cache(maxsize=1)
def _get_qdrant():
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance, VectorParams, SparseVectorParams, SparseIndexParams,
    )
    client = QdrantClient(url=QDRANT_URL, timeout=60)
    info = None
    try:
        info = client.get_collection(COLLECTION)
    except Exception:
        info = None

    # Recreate the collection if it is missing or has the wrong dense dimension
    # (e.g. left over from the previous 384-dim MiniLM index).
    needs_create = info is None
    if info is not None:
        try:
            dense_cfg = info.config.params.vectors.get("dense")
            if dense_cfg is None or dense_cfg.size != DENSE_DIM:
                logger.warning(
                    f"Collection '{COLLECTION}' has wrong dense dim "
                    f"({getattr(dense_cfg, 'size', None)} != {DENSE_DIM}); recreating."
                )
                client.delete_collection(COLLECTION)
                needs_create = True
        except Exception:
            client.delete_collection(COLLECTION)
            needs_create = True

    if needs_create:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config={
                "dense": VectorParams(size=DENSE_DIM, distance=Distance.COSINE),
            },
            sparse_vectors_config={
                "sparse": SparseVectorParams(index=SparseIndexParams()),
            },
        )
        logger.info(f"Created Qdrant collection '{COLLECTION}' ({DENSE_DIM}-dim dense + sparse)")
    return client


# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------

def _encode(texts: list[str]) -> tuple[list[list[float]], list[dict]]:
    """Return (dense_vectors, sparse_weight_dicts) for a batch of texts."""
    out = _get_embedder().encode(
        texts,
        return_dense=True,
        return_sparse=True,
        return_colbert_vecs=False,
    )
    dense = [v.tolist() if hasattr(v, "tolist") else list(v) for v in out["dense_vecs"]]
    sparse = out["lexical_weights"]  # list of dict[token_id(str) -> weight(float)]
    return dense, sparse


def _to_sparse_vector(weights: dict):
    """Convert BGE-M3 lexical weights into a Qdrant SparseVector."""
    from qdrant_client.models import SparseVector
    indices = [int(k) for k in weights.keys()]
    values  = [float(v) for v in weights.values()]
    return SparseVector(indices=indices, values=values)


def _point_id(doc_type: str, doc_id: int, chunk_index: int) -> str:
    """Deterministic UUID so re-indexing the same chunk is idempotent."""
    return str(uuid.uuid5(uuid.NAMESPACE_OID, f"{doc_type}:{doc_id}:{chunk_index}"))


def _ref(doc_type: str, doc_id: int) -> str:
    return f"{doc_type}:{doc_id}"


def _chunk_text(text: str) -> list[str]:
    words = text.split()
    if not words:
        return []
    step = max(1, CHUNK_WORDS - CHUNK_OVERLAP)
    chunks = [
        " ".join(words[i: i + CHUNK_WORDS])
        for i in range(0, len(words), step)
    ]
    return chunks[:MAX_CHUNKS]


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------

def index_document(
    doc_id: int,
    doc_type: str,          # "uploaded" | "scraped"
    text: str,
    title: Optional[str] = None,
    filename: Optional[str] = None,
    url: Optional[str] = None,
    asset_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> None:
    if not text or not text.strip():
        return
    try:
        from qdrant_client.models import (
            PointStruct, Filter, FieldCondition, MatchValue,
        )

        client = _get_qdrant()
        ref = _ref(doc_type, doc_id)

        # Remove any previously-indexed chunks for this document (handles edits
        # and shrinking documents) before writing the new set.
        client.delete(
            collection_name=COLLECTION,
            points_selector=Filter(
                must=[FieldCondition(key="ref", match=MatchValue(value=ref))]
            ),
        )

        chunks = _chunk_text(text)
        if not chunks:
            return

        dense_vecs, sparse_weights = _encode(chunks)

        points = []
        for i, chunk in enumerate(chunks):
            points.append(PointStruct(
                id=_point_id(doc_type, doc_id, i),
                vector={
                    "dense":  dense_vecs[i],
                    "sparse": _to_sparse_vector(sparse_weights[i]),
                },
                payload={
                    "doc_id":       doc_id,
                    "type":         doc_type,
                    "ref":          ref,
                    "asset_id":     asset_id or "",
                    "workspace_id": workspace_id or "",
                    "active":       True,
                    "chunk_index":  i,
                    "title":        title or "",
                    "filename":     filename or "",
                    "url":          url or "",
                    "text":         chunk,
                    "snippet":      chunk[:600].strip(),
                },
            ))

        client.upsert(collection_name=COLLECTION, points=points)
        logger.info(f"Indexed {doc_type} doc {doc_id} as {len(points)} chunk(s)")
    except Exception as e:
        logger.error(f"Qdrant index failed ({doc_type} {doc_id}): {e}")


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def search_documents(
    query: str,
    limit: int = 10,
    doc_type: Optional[str] = None,
    allowed_refs: Optional[list[str]] = None,
    rerank: bool = True,
    dedup_by_doc: bool = False,
) -> list[dict]:
    """
    Hybrid (dense + sparse) retrieval with RRF fusion and optional cross-encoder rerank.

    allowed_refs: if provided, restrict results to these "{type}:{doc_id}" refs (RBAC).
                  An empty list means "no accessible documents" → returns [].
                  None means "no restriction" (e.g. admin).
    dedup_by_doc: collapse chunks to one best result per document (for document search).
    """
    if not query.strip():
        return []
    if allowed_refs is not None and len(allowed_refs) == 0:
        return []
    try:
        from qdrant_client.models import (
            Filter, FieldCondition, MatchValue, MatchAny,
            NamedVector, NamedSparseVector,
        )

        dense_q, sparse_q = _encode([query])
        dense_vec = dense_q[0]
        sparse_vec = _to_sparse_vector(sparse_q[0])

        conditions = []
        if doc_type and doc_type != "all":
            conditions.append(FieldCondition(key="type", match=MatchValue(value=doc_type)))
        if allowed_refs is not None:
            conditions.append(FieldCondition(key="ref", match=MatchAny(any=allowed_refs)))
        # Exclude assets that have been trashed in the explorer (active == False).
        # Points indexed before this field existed have no "active" key and are kept.
        flt = Filter(
            must=conditions or None,
            must_not=[FieldCondition(key="active", match=MatchValue(value=False))],
        )

        client = _get_qdrant()
        fetch_k = max(RERANK_CANDIDATES, limit * 4)

        dense_hits = client.search(
            collection_name=COLLECTION,
            query_vector=NamedVector(name="dense", vector=dense_vec),
            query_filter=flt,
            limit=fetch_k,
            with_payload=True,
        )
        sparse_hits = client.search(
            collection_name=COLLECTION,
            query_vector=NamedSparseVector(name="sparse", vector=sparse_vec),
            query_filter=flt,
            limit=fetch_k,
            with_payload=True,
        )

        # Reciprocal Rank Fusion (k=60 is standard)
        K = 60
        rrf: dict[str, float] = {}
        payloads: dict[str, dict] = {}
        for hits in (dense_hits, sparse_hits):
            for rank, hit in enumerate(hits):
                pid = str(hit.id)
                rrf[pid] = rrf.get(pid, 0.0) + 1.0 / (K + rank + 1)
                payloads.setdefault(pid, hit.payload)

        fused_ids = sorted(rrf, key=lambda x: rrf[x], reverse=True)[:RERANK_CANDIDATES]

        # Cross-encoder rerank over the fused candidate chunks
        if rerank and fused_ids:
            pairs = [[query, payloads[pid].get("text") or payloads[pid].get("snippet", "")]
                     for pid in fused_ids]
            scores = _get_reranker().compute_score(pairs, normalize=True)
            if not isinstance(scores, list):
                scores = [scores]
            ranked = sorted(zip(fused_ids, scores), key=lambda x: x[1], reverse=True)
            ordered = [(pid, float(sc)) for pid, sc in ranked]
        else:
            ordered = [(pid, round(rrf[pid], 4)) for pid in fused_ids]

        results: list[dict] = []
        seen_docs: set[str] = set()
        for pid, score in ordered:
            p = payloads[pid]
            ref = p.get("ref")
            if dedup_by_doc and ref in seen_docs:
                continue
            seen_docs.add(ref)
            results.append({
                "doc_id":   p["doc_id"],
                "type":     p["type"],
                "title":    p.get("title", ""),
                "snippet":  p.get("snippet", ""),
                "filename": p.get("filename", ""),
                "url":      p.get("url", ""),
                "score":    round(score, 4),
            })
            if len(results) >= limit:
                break

        return results
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}")
        return []


# ---------------------------------------------------------------------------
# Bulk re-index (called from /search/reindex endpoint)
# ---------------------------------------------------------------------------

def set_refs_active(refs: list[str], active: bool) -> int:
    """Toggle the `active` flag on all chunks of the given documents (trash/restore sync)."""
    if not refs:
        return 0
    try:
        from qdrant_client.models import Filter, FieldCondition, MatchAny
        _get_qdrant().set_payload(
            collection_name=COLLECTION,
            payload={"active": active},
            points=Filter(must=[FieldCondition(key="ref", match=MatchAny(any=refs))]),
        )
        return len(refs)
    except Exception as e:
        logger.error(f"set_refs_active failed: {e}")
        return 0


def delete_refs(refs: list[str]) -> int:
    """Permanently delete all chunks of the given documents (purge sync)."""
    if not refs:
        return 0
    try:
        from qdrant_client.models import Filter, FieldCondition, MatchAny
        _get_qdrant().delete(
            collection_name=COLLECTION,
            points_selector=Filter(must=[FieldCondition(key="ref", match=MatchAny(any=refs))]),
        )
        return len(refs)
    except Exception as e:
        logger.error(f"delete_refs failed: {e}")
        return 0


def reindex_all(db) -> int:
    from models import ScrapedDocument
    from sqlalchemy import text as sa_text

    count = 0

    # Scraped documents
    for doc in db.query(ScrapedDocument).all():
        index_document(doc.id, "scraped", doc.content or "", doc.title, url=doc.url)
        count += 1

    # Uploaded documents (Prisma-managed table — raw SQL)
    rows = db.execute(
        sa_text(
            'SELECT id, filename, "extractedText", title '
            'FROM "UploadedDocument"'
        )
    ).fetchall()
    for row in rows:
        index_document(
            row.id, "uploaded",
            row.extractedText or "",
            row.title or row.filename,
            filename=row.filename,
        )
        count += 1

    logger.info(f"Re-indexed {count} documents")
    return count
