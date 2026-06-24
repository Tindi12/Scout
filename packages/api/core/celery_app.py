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

    worker_concurrency=3,  #for dev but switch to 3 for production
    task_soft_time_limit=300,   # 5 min soft limit per task
    task_time_limit=360,        # 6 min hard limit per task
    task_max_retries=2,         # retry failed applications twice
    task_default_retry_delay=30 # wait 30s before retry
)
