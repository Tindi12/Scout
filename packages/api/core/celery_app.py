import os
from celery import Celery
from dotenv import load_dotenv


load_dotenv()

REDIS_URL = os.getenv("REDIS_URL")

if not REDIS_URL:
    raise RuntimeError("REDIS_URL must be set in environment")

celery_app = Celery(
    "scout",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks.job_tasks"]  # ← add this line
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
