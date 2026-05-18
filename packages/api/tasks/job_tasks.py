import asyncio
import logging

from core.celery_app import celery_app
from services.job_fetcher import fetch_all_jobs
from services.job_store import store_jobs

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.refresh_jobs")
def refresh_jobs_task() -> dict:
    logger.info("refresh_jobs_task: starting")
    jobs = asyncio.run(fetch_all_jobs())
    result = asyncio.run(store_jobs(jobs))
    logger.info("refresh_jobs_task: done — %s", result)
    return result

