import logging
import threading
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models import ScrapingJob, ScrapingMode, ScrapingStatus
from scraper import run_scraping_job, run_url_scraping_job
from scheduler import scheduler

logger = logging.getLogger(__name__)
router = APIRouter(tags=["scraper"])


# ─────────────────────────────────────────────
# Request / response models
# ─────────────────────────────────────────────

class RunJobRequest(BaseModel):
    jobId: int
    targetCoins: List[str]
    attributes: List[str]
    mode: str
    intervalSeconds: Optional[int] = None


class ScrapeRequest(BaseModel):
    jobId: int
    url: str
    mode: str
    intervalSeconds: Optional[int] = None


class RunUrlJobRequest(BaseModel):
    jobId: int


# ─────────────────────────────────────────────
# Scheduler helpers
# ─────────────────────────────────────────────

def schedule_continuous_job(
    job_id: int,
    target_coins: List[str],
    attributes: List[str],
    interval_seconds: int,
):
    scheduler.add_job(
        func=run_scraping_job,
        trigger="interval",
        seconds=interval_seconds,
        id=str(job_id),
        args=[job_id, target_coins, attributes, SessionLocal()],
        replace_existing=True,
        max_instances=1,
    )
    logger.info(f"Scheduled CMC job {job_id} every {interval_seconds}s")


def schedule_url_continuous_job(job_id: int, url: str, interval_seconds: int):
    scheduler.add_job(
        func=run_url_scraping_job,
        trigger="interval",
        seconds=interval_seconds,
        id=str(job_id),
        args=[job_id, url, SessionLocal()],
        replace_existing=True,
        max_instances=1,
    )
    logger.info(f"Scheduled URL job {job_id} every {interval_seconds}s")


# ─────────────────────────────────────────────
# CoinMarketCap endpoints (legacy, preserved)
# ─────────────────────────────────────────────

@router.post("/scraper/run")
def run_job(req: RunJobRequest, db: Session = Depends(get_db)):
    """Trigger a CoinMarketCap scraping job."""
    job = db.query(ScrapingJob).filter(ScrapingJob.id == req.jobId).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if req.mode == "ONE_TIME":
        t = threading.Thread(
            target=run_scraping_job,
            args=[req.jobId, req.targetCoins, req.attributes, SessionLocal()],
            daemon=True,
        )
        t.start()
        return {"message": "One-time scraping job started", "jobId": req.jobId}

    elif req.mode == "CONTINUOUS":
        if not req.intervalSeconds or req.intervalSeconds < 5:
            raise HTTPException(status_code=400, detail="intervalSeconds must be >= 5 for continuous mode")

        t = threading.Thread(
            target=run_scraping_job,
            args=[req.jobId, req.targetCoins, req.attributes, SessionLocal()],
            daemon=True,
        )
        t.start()
        schedule_continuous_job(req.jobId, req.targetCoins, req.attributes, req.intervalSeconds)
        return {"message": f"Continuous job scheduled every {req.intervalSeconds}s", "jobId": req.jobId}

    raise HTTPException(status_code=400, detail="Invalid mode")


@router.post("/scraper/jobs/{job_id}/stop")
def stop_job(job_id: int, db: Session = Depends(get_db)):
    try:
        scheduler.remove_job(str(job_id))
    except Exception:
        pass

    job = db.query(ScrapingJob).filter(ScrapingJob.id == job_id).first()
    if job:
        job.status = ScrapingStatus.PAUSED
        db.commit()

    return {"message": f"Job {job_id} stopped"}


@router.post("/scraper/jobs/{job_id}/resume")
def resume_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(ScrapingJob).filter(ScrapingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.mode != ScrapingMode.CONTINUOUS:
        raise HTTPException(status_code=400, detail="Only continuous jobs can be resumed")

    job.status = ScrapingStatus.ACTIVE
    db.commit()

    if job.url:
        schedule_url_continuous_job(job.id, job.url, job.intervalSeconds)
    else:
        schedule_continuous_job(job.id, job.targetCoins, job.attributes, job.intervalSeconds)

    return {"message": f"Job {job_id} resumed"}


# ─────────────────────────────────────────────
# Generic URL scraping endpoints
# ─────────────────────────────────────────────

@router.post("/scrape")
def scrape_url_endpoint(req: ScrapeRequest, db: Session = Depends(get_db)):
    """Trigger a generic URL scraping job."""
    job = db.query(ScrapingJob).filter(ScrapingJob.id == req.jobId).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if req.mode == "ONE_TIME":
        t = threading.Thread(
            target=run_url_scraping_job,
            args=[req.jobId, req.url, SessionLocal()],
            daemon=True,
        )
        t.start()
        return {"message": "URL scraping job started", "jobId": req.jobId}

    elif req.mode == "CONTINUOUS":
        if not req.intervalSeconds or req.intervalSeconds < 5:
            raise HTTPException(status_code=400, detail="intervalSeconds must be >= 5 for continuous mode")

        t = threading.Thread(
            target=run_url_scraping_job,
            args=[req.jobId, req.url, SessionLocal()],
            daemon=True,
        )
        t.start()
        schedule_url_continuous_job(req.jobId, req.url, req.intervalSeconds)
        return {"message": f"Continuous URL job scheduled every {req.intervalSeconds}s", "jobId": req.jobId}

    raise HTTPException(status_code=400, detail="Invalid mode")


@router.post("/scrape/run-job")
def run_url_job(req: RunUrlJobRequest, db: Session = Depends(get_db)):
    """Run an existing URL-based job immediately (used by scheduler callbacks)."""
    job = db.query(ScrapingJob).filter(ScrapingJob.id == req.jobId).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.url:
        raise HTTPException(status_code=400, detail="Job has no URL configured")

    t = threading.Thread(
        target=run_url_scraping_job,
        args=[req.jobId, job.url, SessionLocal()],
        daemon=True,
    )
    t.start()
    return {"message": "URL job triggered", "jobId": req.jobId}
