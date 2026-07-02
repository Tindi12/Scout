"""Per-user rate limiting for budget-draining endpoints (Epic 11 hardening).

LLM calls (resume parse / score / analyze / rewrite / variant) and embedding-backed
job matching cost real money per request. The browser-apply pipeline already has a
concurrency governor and Copilot has its own daily cap; this covers the remaining
unprotected LLM endpoints so a single scripted account can't run up the OpenAI bill.

Implementation: a fixed-window counter in Redis (the same instance Celery and the
verification-code relay already use). Fail-open — if Redis is unreachable the request
is allowed: a rate limiter must never take the product down, and the Redis outage will
surface through /health and Sentry on its own.
"""
import logging
import os
import time
from typing import Callable

from fastapi import Depends, HTTPException, status
from starlette.concurrency import run_in_threadpool

from core.auth import verify_resume_api_user
from core.redis_client import get_redis

logger = logging.getLogger(__name__)

# One-hour windows. Limits are generous for real use but cap runaway scripted cost.
# Tunable via env (Railway) without a code change.
_WINDOW_SECONDS = 3600
_RESUME_LIMIT = int(os.getenv("RATE_LIMIT_RESUME_PER_HOUR", "30"))
_MATCH_LIMIT = int(os.getenv("RATE_LIMIT_MATCH_PER_HOUR", "60"))


def _allow(action: str, sub: str, limit: int, window_seconds: int) -> bool:
    """Increment this user's fixed-window counter and report whether they're still
    at/under the limit. The key embeds the window bucket so it resets automatically and
    the TTL reaps it. Any Redis error fails open (returns True)."""
    try:
        r = get_redis()
        bucket = int(time.time()) // window_seconds
        key = f"ratelimit:{action}:{sub}:{bucket}"
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds)
        count = pipe.execute()[0]
        return int(count) <= limit
    except Exception:
        logger.warning(
            "Rate-limit check failed open for %s (Redis error)", action, exc_info=True
        )
        return True


def rate_limit(
    action: str, *, limit: int, window_seconds: int = _WINDOW_SECONDS
) -> Callable:
    """Build a dependency capping `action` to `limit` calls per window per user.

    Resolves the caller via verify_resume_api_user, which FastAPI caches within a
    request — so adding this alongside require_paid does NOT decode the token twice.
    Returns the user dict (so it can replace the existing auth dependency) and raises
    429 with a Retry-After header when the limit is hit."""

    async def dependency(current_user: dict = Depends(verify_resume_api_user)) -> dict:
        sub = current_user.get("sub")
        if sub:
            allowed = await run_in_threadpool(
                _allow, action, sub, limit, window_seconds
            )
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please wait a bit and try again.",
                    headers={"Retry-After": str(window_seconds)},
                )
        return current_user

    return dependency


# Shared bucket across all resume LLM ops (parse/score/analyze/rewrite/variant): caps
# total resume-AI spend per user per hour regardless of which operation is called.
resume_llm_rate_limit = rate_limit("resume_llm", limit=_RESUME_LIMIT)

# Embedding-backed job matching.
job_match_rate_limit = rate_limit("job_match", limit=_MATCH_LIMIT)
