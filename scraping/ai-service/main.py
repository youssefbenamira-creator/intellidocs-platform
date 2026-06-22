import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, SessionLocal
from models import Base, ScrapingJob, ScrapingMode, ScrapingStatus
from scheduler import scheduler
from routers.scraper import schedule_continuous_job, schedule_url_continuous_job
from routers import scraper as scraper_router
from routers import documents as documents_router
from routers import nlp as nlp_router
from routers import search as search_router
from routers import assistant as assistant_router
from routers import analytics as analytics_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def reload_active_jobs():
    """On startup, re-add all ACTIVE CONTINUOUS jobs to the scheduler."""
    db = SessionLocal()
    try:
        active_jobs = db.query(ScrapingJob).filter(
            ScrapingJob.mode == ScrapingMode.CONTINUOUS,
            ScrapingJob.status == ScrapingStatus.ACTIVE,
        ).all()

        for job in active_jobs:
            if not job.intervalSeconds:
                continue

            if job.url:
                schedule_url_continuous_job(job.id, job.url, job.intervalSeconds)
                logger.info(f"Reloaded URL job {job.id} ({job.name}) on startup")
            elif job.targetCoins:
                schedule_continuous_job(job.id, job.targetCoins, job.attributes, job.intervalSeconds)
                logger.info(f"Reloaded CMC job {job.id} ({job.name}) on startup")
    finally:
        db.close()


async def _ensure_ollama_model():
    """Pull the LLM model in the background if it isn't already cached."""
    ollama_url = os.getenv("OLLAMA_URL", "http://ollama:11434")
    model      = os.getenv("LLM_MODEL",  "mistral")

    # Wait for Ollama to become reachable (up to 60 s)
    for _ in range(30):
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                await c.get(f"{ollama_url}/api/tags")
            break
        except Exception:
            await asyncio.sleep(2)
    else:
        logger.warning("Ollama unreachable — skipping model pull")
        return

    # Check if model is already present
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            res = await c.post(f"{ollama_url}/api/show", json={"name": model})
            if res.status_code == 200:
                logger.info(f"LLM model '{model}' already available")
                return
    except Exception:
        pass

    # Pull the model (first-time, can take several minutes)
    logger.info(f"Pulling LLM model '{model}' — this may take a while…")
    try:
        async with httpx.AsyncClient(timeout=3600) as c:
            async with c.stream("POST", f"{ollama_url}/api/pull", json={"name": model}) as resp:
                async for line in resp.aiter_lines():
                    if line:
                        try:
                            d = json.loads(line)
                            status = d.get("status", "")
                            total  = d.get("total", 0)
                            done   = d.get("completed", 0)
                            if total:
                                logger.info(f"Pull [{model}]: {status} {done/total*100:.1f}%")
                            else:
                                logger.info(f"Pull [{model}]: {status}")
                        except Exception:
                            pass
        logger.info(f"Model '{model}' ready")
    except Exception as e:
        logger.error(f"Model pull failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    reload_active_jobs()
    asyncio.create_task(_ensure_ollama_model())
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="PFE AI Scraper", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scraper_router.router)
app.include_router(documents_router.router)
app.include_router(nlp_router.router)
app.include_router(search_router.router)
app.include_router(assistant_router.router)
app.include_router(analytics_router.router)


@app.get("/health")
def health():
    return {"status": "ok", "scheduler_running": scheduler.running}
