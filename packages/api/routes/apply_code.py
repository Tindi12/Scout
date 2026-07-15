"""
Public mid-run channel between Scout and a live Browserbase agent run.

The hosted Agents platform exposes no way to reach a running agent (no stop route, no
session access, no messages-to-run — probed live 2026-07-01), but the agent CAN fetch
URLs. So each apply attempt gets an unguessable token and two plain-text URLs the
system prompt tells the agent to open in a new tab:

  GET /apply-control/{token}  →  "OK" | "CANCEL"
      Checked immediately BEFORE clicking the final Submit. This is what makes
      Stop-All actually stop a live run (the platform can't kill it server-side):
      the agent aborts at the submit boundary instead of submitting after the user
      said stop. Also set on the worker's deadline path to prevent an abandoned
      attempt double-submitting alongside its retry.

  GET /apply-code/{token}     →  "WAIT" | "CANCEL" | "TIMEOUT" | "<the code>"
      Polled when an ATS demands an emailed verification code. The FIRST hit writes
      the gate marker (apply:gate:{app_id} = epoch seconds) — that is the worker's
      awaiting-verification signal. The code lands in the Redis mailbox
      apply:code:{app_id} — pushed there by the AgentMail relay webhook or pasted by
      the user via the CodeModal — and this route serves it. Both sources converge on
      the same mailbox.

Security model: no Clerk auth (the agent has no user token) — authentication is the
128-bit single-purpose token, minted per attempt, stored only in Redis with a TTL,
resolving only to an application id. Responses are text/plain and carry at most an
8-character one-time code; no PII. Unknown/expired tokens 404.
"""
import logging
import os
import time

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from starlette.concurrency import run_in_threadpool

from core.redis_client import (
    GATE_FLAG_TTL,
    cancel_key,
    cancelled_token_key,
    control_token_key,
    gate_key,
    get_redis,
    verification_code_key,
)

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter()

# How long after the gate is first hit the code endpoint keeps saying WAIT before
# telling the agent to give up. The agent's own instructions carry a slightly larger
# budget as a belt; the worker stops fetching at the same window.
APPLY_VERIFY_TIMEOUT = int(os.getenv("APPLY_VERIFY_TIMEOUT", "300"))


def _resolve_application(token: str) -> str:
    app_id = get_redis().get(control_token_key(token))
    if not app_id:
        raise HTTPException(status_code=404, detail="Not found")
    return app_id


def _is_cancelled(token: str, application_id: str) -> bool:
    r = get_redis()
    return bool(r.get(cancelled_token_key(token)) or r.get(cancel_key(application_id)))


@router.get("/apply-control/{token}", response_class=PlainTextResponse)
async def apply_control(token: str) -> str:
    """Pre-submit go/no-go for the live agent. Fail-open by design: if this route is
    unreachable the agent is instructed to proceed (an availability blip must not
    block every submit) — so only an explicit CANCEL means stop."""

    def _check() -> str:
        application_id = _resolve_application(token)
        return "CANCEL" if _is_cancelled(token, application_id) else "OK"

    return await run_in_threadpool(_check)


@router.get("/apply-code/{token}", response_class=PlainTextResponse)
async def apply_code(token: str) -> str:
    """Verification-code mailbox for the live agent; first hit signals the gate."""

    def _check() -> str:
        r = get_redis()
        application_id = _resolve_application(token)

        if _is_cancelled(token, application_id):
            return "CANCEL"

        # First poll = the gate signal. SET NX so only the first hit timestamps it;
        # the worker's poll loop reacts within one tick (status -> awaiting_code,
        # notification).
        gate = gate_key(application_id)
        now = int(time.time())
        if r.set(gate, str(now), nx=True, ex=GATE_FLAG_TTL):
            logger.info(
                "Verification gate hit for application %s (token %s…)",
                application_id, token[:8],
            )
            gate_hit = now
        else:
            try:
                gate_hit = int(r.get(gate) or now)
            except (TypeError, ValueError):
                gate_hit = now

        code = r.get(verification_code_key(application_id))
        if code:
            return code

        if now - gate_hit > APPLY_VERIFY_TIMEOUT:
            return "TIMEOUT"
        return "WAIT"

    return await run_in_threadpool(_check)
