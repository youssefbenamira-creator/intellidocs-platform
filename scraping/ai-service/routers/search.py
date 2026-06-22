import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from search_utils import (
    index_document, search_documents, reindex_all,
    set_refs_active, delete_refs,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])


class IndexRequest(BaseModel):
    doc_id: int
    type: str           # "uploaded" | "scraped"
    text: str
    title: Optional[str] = None
    filename: Optional[str] = None
    url: Optional[str] = None
    asset_id: Optional[str] = None
    workspace_id: Optional[str] = None


class RefsRequest(BaseModel):
    refs: list[str]
    active: bool = True


class SearchQuery(BaseModel):
    query: str
    limit: int = 10
    type: Optional[str] = None              # None / "all" = no type filter
    # RBAC scoping: list of "{type}:{doc_id}" the caller may access.
    # None = unrestricted (admin); [] = no access → no results.
    allowed_refs: Optional[list[str]] = None


@router.post("/index")
async def index(req: IndexRequest):
    index_document(
        doc_id=req.doc_id,
        doc_type=req.type,
        text=req.text,
        title=req.title,
        filename=req.filename,
        url=req.url,
        asset_id=req.asset_id,
        workspace_id=req.workspace_id,
    )
    return {"status": "indexed"}


@router.post("/set-active")
async def set_active(req: RefsRequest):
    """Trash/restore sync: toggle visibility of a document's vectors."""
    count = set_refs_active(req.refs, req.active)
    return {"status": "ok", "updated": count}


@router.post("/remove")
async def remove(req: RefsRequest):
    """Purge sync: permanently delete a document's vectors."""
    count = delete_refs(req.refs)
    return {"status": "ok", "removed": count}


@router.post("/query")
async def query(req: SearchQuery):
    doc_type = req.type if req.type and req.type != "all" else None
    results = search_documents(
        req.query, req.limit, doc_type,
        allowed_refs=req.allowed_refs,
        dedup_by_doc=True,
    )
    return {"results": results}


@router.post("/reindex")
async def reindex():
    """Re-index every document already in the database. Admin-only via NestJS."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        count = reindex_all(db)
        return {"status": "ok", "indexed": count}
    finally:
        db.close()
