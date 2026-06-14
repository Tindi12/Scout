"""
Shared synchronous Redis client (same Redis instance Celery uses as its broker).

Acts as the live mailbox between the FastAPI process and a mid-run browser agent
inside the Celery worker. First use: ATS verification codes — the user pastes the
emailed code into the tracker UI, FastAPI drops it at `apply:code:{application_id}`,
and the agent's `request_verification_code` tool polls it up mid-session.

Values are short-lived secrets: always write with a TTL and delete after reading.
"""
import os

import redis
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    raise RuntimeError("REDIS_URL must be set in environment")

# Codes expire on their own if the agent never collects them (e.g. run already dead).
VERIFICATION_CODE_TTL = 900  # seconds

# Stop-all cancel flags: set per application by the stop-all endpoint; the browser
# agent's in-run watcher polls them and aborts the live run within seconds. The TTL
# bounds staleness, and apply_to_job_task deletes the flag at start so a re-queued
# application isn't instantly killed by a flag from an earlier cancellation.
CANCEL_FLAG_TTL = 3600  # seconds

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Process-wide Redis client (lazy singleton, str responses)."""
    global _client
    if _client is None:
        _client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _client


def verification_code_key(application_id: str) -> str:
    return f"apply:code:{application_id}"


def cancel_key(application_id: str) -> str:
    return f"apply:cancel:{application_id}"
