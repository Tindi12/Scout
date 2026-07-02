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

# Per-run control tokens (apply:code:token:{token} -> application_id). Minted per apply
# ATTEMPT so an abandoned attempt's token can be cancelled without touching the retry's.
# TTL covers the whole run budget with slack.
CONTROL_TOKEN_TTL = 1800  # seconds

# Gate-hit marker (apply:gate:{application_id} -> epoch seconds of first code poll).
# Written by the public code endpoint; read by the worker poll loop as the
# awaiting-verification signal and by the endpoint itself for the TIMEOUT window.
GATE_FLAG_TTL = 1800  # seconds

# A consumed verification-email marker (apply:code:consumed:{message_id}) so one email
# can never satisfy two applications, even across the serialization mutex.
CODE_CONSUMED_TTL = 3600  # seconds

# Per-user Greenhouse verification mutex: at most one Greenhouse apply in flight per
# user, because two parked applies would receive two indistinguishable code emails.
# TTL is a crash backstop above the task hard time limit (960s); normal release is the
# task's finally.
GH_VERIFY_MUTEX_TTL = 1200  # seconds

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


def control_token_key(token: str) -> str:
    """Maps an unguessable per-attempt token to its application_id (the only
    authentication the public /apply-control|/apply-code routes have)."""
    return f"apply:code:token:{token}"


def cancelled_token_key(token: str) -> str:
    """Set when THIS attempt is abandoned (deadline exceeded) so the old run aborts at
    its pre-submit control check while a retry attempt (new token) proceeds."""
    return f"apply:code:token:{token}:cancelled"


def gate_key(application_id: str) -> str:
    return f"apply:gate:{application_id}"


def code_consumed_key(message_id: str) -> str:
    return f"apply:code:consumed:{message_id}"


def gh_verify_mutex_key(user_id: str) -> str:
    return f"apply:ghverify:{user_id}"


# Compare-and-delete so one task can never release a mutex a later task now holds.
_RELEASE_IF_OWNER_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


def acquire_gh_verify_mutex(user_id: str, token: str) -> bool:
    """Take the per-user Greenhouse mutex. Fails open on Redis errors (losing
    serialization briefly beats wedging the apply pipeline), mirroring the
    concurrency semaphore's posture."""
    try:
        return bool(
            get_redis().set(
                gh_verify_mutex_key(user_id), token, nx=True, ex=GH_VERIFY_MUTEX_TTL
            )
        )
    except Exception:
        return True


def release_gh_verify_mutex(user_id: str, token: str) -> None:
    try:
        get_redis().eval(_RELEASE_IF_OWNER_LUA, 1, gh_verify_mutex_key(user_id), token)
    except Exception:
        pass  # TTL backstop reaps it
