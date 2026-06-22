import json
import logging
import os
import re
from typing import Optional

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from search_utils import search_documents

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assistant", tags=["assistant"])

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
MODEL      = os.getenv("LLM_MODEL",  "mistral")

SYSTEM_PROMPT = (
    "You are an intelligent document assistant. "
    "Answer questions using ONLY the documents provided as context. "
    "Always respond in the same language as the user's question — if the question is in French, answer in French. "
    "Respond directly with the answer. Do NOT include any preamble, restating of the "
    "question, meta-commentary, or step-by-step reasoning — give only the final answer. "
    "Be concise and accurate. "
    "If the answer cannot be found in the documents, say so clearly without inventing information. "
    "When you use information from a document, mention its title."
)


def _visible_prefix(raw: str) -> str:
    """Strip Qwen3 <think>...</think> reasoning from streamed text.

    Removes completed think blocks and hides anything after an as-yet-unclosed
    <think>, so partial tags split across tokens are never shown to the user.
    """
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    idx = cleaned.find("<think>")
    if idx != -1:
        cleaned = cleaned[:idx]
    return cleaned.lstrip("\n")


class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[HistoryMessage] = []
    # RBAC scoping: list of "{type}:{doc_id}" the caller may access.
    # None = unrestricted (admin); [] = no access → no results.
    allowed_refs: Optional[list[str]] = None


@router.post("/chat")
async def chat(req: ChatRequest):
    async def generate():
        # 1. Retrieve relevant context via hybrid search, scoped to the caller's
        #    accessible documents (RBAC), reranked by the cross-encoder.
        sources = search_documents(
            req.question, limit=6, allowed_refs=req.allowed_refs, rerank=True,
        )

        if not sources:
            msg = (
                "Aucun document pertinent trouvé. Veuillez d'abord importer ou scraper des documents."
                if _is_french(req.question) else
                "No relevant documents found. Please upload or scrape some documents first."
            )
            yield f"data: {json.dumps({'token': msg})}\n\n"
            yield f"data: {json.dumps({'sources': [], 'done': True})}\n\n"
            return

        # 2. Build grounded context block
        ctx_parts = []
        for s in sources:
            title = s.get("title") or s.get("filename") or s.get("url") or "Document"
            snippet = s.get("snippet", "")[:800]
            ctx_parts.append(f"[{title}]\n{snippet}")
        context = "\n\n---\n\n".join(ctx_parts)

        # 3. Compose message list (keep last 6 turns for multi-turn)
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for m in req.history[-6:]:
            messages.append({"role": m.role, "content": m.content})
        messages.append({
            "role": "user",
            "content": f"Context documents:\n\n{context}\n\nQuestion: {req.question}",
        })

        # 4. Stream tokens from Ollama
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/chat",
                    json={
                        "model": MODEL,
                        "messages": messages,
                        "stream": True,
                        # Qwen3 ships with reasoning mode on by default; disable it so
                        # the assistant streams the answer directly (no <think> preamble).
                        "think": False,
                        "options": {"num_ctx": 3072},
                    },
                ) as resp:
                    if resp.status_code != 200:
                        err = await resp.aread()
                        yield f"data: {json.dumps({'token': f'Ollama error {resp.status_code}: {err.decode()}'})}\n\n"
                    else:
                        raw = ""        # full accumulated model output
                        sent_len = 0    # how much of the visible (think-stripped) text we've emitted
                        async for line in resp.aiter_lines():
                            if not line:
                                continue
                            try:
                                data = json.loads(line)
                                token = data.get("message", {}).get("content", "")
                                if token:
                                    raw += token
                                    visible = _visible_prefix(raw)
                                    delta = visible[sent_len:]
                                    if delta:
                                        sent_len = len(visible)
                                        yield f"data: {json.dumps({'token': delta})}\n\n"
                                if data.get("done"):
                                    break
                            except json.JSONDecodeError:
                                pass
        except httpx.ConnectError:
            yield f"data: {json.dumps({'token': 'Ollama is not reachable. Make sure it is running.'})}\n\n"
        except Exception as e:
            logger.error(f"Ollama stream error: {e}")
            yield f"data: {json.dumps({'token': f'Error: {e}'})}\n\n"

        # 5. Send sources metadata + done signal
        yield f"data: {json.dumps({'sources': sources, 'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/status")
async def status():
    """Check whether Ollama is up and the model is available."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(f"{OLLAMA_URL}/api/tags")
            models = [m["name"] for m in res.json().get("models", [])]
            ready = any(MODEL in m for m in models)
            return {"ollama": "up", "model": MODEL, "ready": ready, "available_models": models}
    except Exception as e:
        return {"ollama": "down", "error": str(e)}


def _is_french(text: str) -> bool:
    french_markers = {"le", "la", "les", "de", "du", "des", "est", "que", "qui", "pour", "dans"}
    words = set(text.lower().split())
    return len(words & french_markers) >= 2
