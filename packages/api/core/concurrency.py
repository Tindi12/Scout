"""
Redis-backed bounded concurrency for the job-application pipeline.

Two caps gate how many `apply_to_job_task` runs may hold a Browserbase session at
once, enforced in Redis so they hold ACROSS worker processes (prefork in prod gives
true parallelism; the in-process worker_concurrency is not a fleet-wide governor):

  - GLOBAL: at most APPLY_MAX_GLOBAL_CONCURRENCY apply tasks system-wide (headroom
    under Browserbase's 25-session ceiling and OpenAI rate limits).
  - PER-USER: at most APPLY_MAX_PER_USER_CONCURRENCY in-flight per user, so one
    user's large batch can't starve everyone else even when global slots are free.

Mechanism — a "fair semaphore" sorted set per cap (member = a per-attempt token,
score = the slot's expiry time in ms). Acquire is a single Lua script over BOTH
sets so concurrent workers cannot race past a cap, and it is all-or-nothing: a user
already at their per-user cap acquires nothing (waits) even if the global set has room.

Slot-leak safety: each slot carries its OWN expiry as its score, so a slot held by a
worker that died (crash/kill/timeout without releasing) is reaped individually by the
next acquirer's ZREMRANGEBYSCORE — capacity self-heals. The TTL (APPLY_SLOT_TTL_SECONDS,
default 1200s / 20 min) is set comfortably above the task's 960s hard time limit so a
live-but-slow task is never reaped out from under itself. A single INCR counter with one
TTL can't do this: it would either never self-heal, or expire ALL slots at once.

Release (ZREM token from both sets) is called from the task's `finally`, so the common
case frees slots immediately; the TTL is only the backstop for the worker-died case.
"""
import os
import time
import uuid

from dotenv import load_dotenv

from core.redis_client import get_redis

load_dotenv()


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


APPLY_MAX_GLOBAL_CONCURRENCY = _int_env("APPLY_MAX_GLOBAL_CONCURRENCY", 18)
APPLY_MAX_PER_USER_CONCURRENCY = _int_env("APPLY_MAX_PER_USER_CONCURRENCY", 5)
# > task hard time_limit (960s) so a live task's slot is never reaped early; the
# auto-expiry only fires for a worker that died without releasing.
APPLY_SLOT_TTL_SECONDS = _int_env("APPLY_SLOT_TTL_SECONDS", 1200)

GLOBAL_SEMAPHORE_KEY = "apply:sema:global"


def _user_semaphore_key(user_id: str) -> str:
    return f"apply:sema:user:{user_id}"


# KEYS[1] global set, KEYS[2] per-user set
# ARGV[1] now_ms, ARGV[2] global_limit, ARGV[3] user_limit, ARGV[4] ttl_ms, ARGV[5] token
# Returns 1 if BOTH slots acquired, else 0 (and acquires neither).
_ACQUIRE_LUA = """
local now = tonumber(ARGV[1])
local global_limit = tonumber(ARGV[2])
local user_limit = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local token = ARGV[5]

-- Reap slots whose expiry has passed (leaked by dead workers).
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)

if redis.call('ZCARD', KEYS[1]) >= global_limit then
  return 0
end
if redis.call('ZCARD', KEYS[2]) >= user_limit then
  return 0
end

local expiry = now + ttl
redis.call('ZADD', KEYS[1], expiry, token)
redis.call('ZADD', KEYS[2], expiry, token)
-- Let idle sets clear themselves; refreshed on every acquire.
redis.call('PEXPIRE', KEYS[1], ttl * 2)
redis.call('PEXPIRE', KEYS[2], ttl * 2)
return 1
"""

# KEYS[1] global set, KEYS[2] per-user set; ARGV[1] token
_RELEASE_LUA = """
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
"""

_acquire_script = None
_release_script = None


def _scripts():
    global _acquire_script, _release_script
    if _acquire_script is None or _release_script is None:
        client = get_redis()
        _acquire_script = client.register_script(_ACQUIRE_LUA)
        _release_script = client.register_script(_RELEASE_LUA)
    return _acquire_script, _release_script


def new_slot_token() -> str:
    """Unique token identifying one slot hold for the lifetime of one task attempt."""
    return uuid.uuid4().hex


def acquire_apply_slots(user_id: str, token: str) -> bool:
    """
    Atomically try to take one global AND one per-user slot. Returns True only if
    both were acquired; on False nothing was taken (the caller should re-queue with
    backoff). Fails open (returns True) if Redis is unreachable — losing the cap is
    safer than wedging the whole apply pipeline on an infra blip.
    """
    acquire, _ = _scripts()
    now_ms = int(time.time() * 1000)
    ttl_ms = APPLY_SLOT_TTL_SECONDS * 1000
    try:
        result = acquire(
            keys=[GLOBAL_SEMAPHORE_KEY, _user_semaphore_key(user_id)],
            args=[
                now_ms,
                APPLY_MAX_GLOBAL_CONCURRENCY,
                APPLY_MAX_PER_USER_CONCURRENCY,
                ttl_ms,
                token,
            ],
        )
        return int(result) == 1
    except Exception:
        return True


def release_apply_slots(user_id: str, token: str) -> None:
    """Release both slots for `token`. Safe to call even if acquire failed (no-op)."""
    _, release = _scripts()
    try:
        release(keys=[GLOBAL_SEMAPHORE_KEY, _user_semaphore_key(user_id)], args=[token])
    except Exception:
        # Don't let a release error mask the real task outcome; the TTL backstop
        # reaps the slot if this genuinely failed.
        pass
