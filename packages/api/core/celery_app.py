import os
from celery import Celery
from dotenv import load_dotenv

from core.observability import init_sentry


load_dotenv()

# Initialize Sentry in the worker process too (the CeleryIntegration captures task
# exceptions). No-ops when SENTRY_DSN is unset.
init_sentry()

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

    # PER-PROCESS task slots. This is NOT a fleet-wide governor: with prefork in prod,
    # total concurrency = worker_concurrency × number of worker processes. Fleet-wide
    # apply fan-out is bounded instead by APPLY_MAX_GLOBAL_CONCURRENCY in Redis (see
    # core/concurrency.py), which holds across every worker. Tune at deploy.
    worker_concurrency=int(os.getenv("CELERY_WORKER_CONCURRENCY", "3")),

    # NOTE: no app-level task_soft_time_limit / task_time_limit here on purpose. The
    # apply task sets its OWN authoritative limits on its decorator (apply_to_job_task:
    # soft_time_limit=900, time_limit=960 in tasks/job_tasks.py), which override any
    # app-level value — app-level limits here would be dead config.
    task_max_retries=2,         # retry failed applications twice
    task_default_retry_delay=30 # wait 30s before retry
)
