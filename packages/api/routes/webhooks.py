"""
Inbound-webhook receivers for third-party push sources.

POST /webhooks/agentmail — AgentMail `message.received` for the apply inbox POOL
(one webhook endpoint serves every pool inbox; the payload's inbox_id routes the
message to the right per-inbox context).
AgentMail delivers through Svix (same signing scheme as the Clerk webhook): the
signature is verified against AGENTMAIL_WEBHOOK_SECRET before anything is parsed,
and unsigned/mis-signed requests are rejected. Classification (OTP consume vs
recruiter-reply forward), matching, and delivery live in core/agentmail_inbox.py;
a non-matching email is a logged 200 skip (AgentMail
redeliveries re-run matching harmlessly — the consumed-message marker makes actual
code delivery once-only), while a transient processing failure returns 500 so Svix
retries it.
"""
import logging
import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from svix.webhooks import Webhook, WebhookVerificationError

from core import agentmail_inbox

load_dotenv()

logger = logging.getLogger(__name__)

AGENTMAIL_WEBHOOK_SECRET = os.getenv("AGENTMAIL_WEBHOOK_SECRET")

router = APIRouter()


@router.post("/agentmail")
async def agentmail_webhook(request: Request) -> dict:
    if not AGENTMAIL_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Missing AGENTMAIL_WEBHOOK_SECRET")

    body = await request.body()
    try:
        payload = Webhook(AGENTMAIL_WEBHOOK_SECRET).verify(body, dict(request.headers))
    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = str(payload.get("event_type") or "")
    if event_type != "message.received":
        return {"ok": True, "skipped": event_type or "unknown_event"}

    message = payload.get("message")
    if not isinstance(message, dict):
        return {"ok": True, "skipped": "malformed_message"}

    try:
        outcome = await run_in_threadpool(
            agentmail_inbox.handle_inbound_message, message
        )
    except Exception as exc:  # noqa: BLE001
        # Transient (Supabase/Redis blip): non-2xx so Svix redelivers. Content is
        # never logged — the message id is enough to correlate in AgentMail's console.
        msg_id = str(message.get("message_id") or "")[:24]
        logger.error("AgentMail webhook processing failed (message %s…): %s", msg_id, exc)
        raise HTTPException(status_code=500, detail="Processing failed") from exc

    # Outcome tags carry an application id ("otp:<id>" / "forwarded:<id>") — return
    # only the classification so the webhook response never echoes internal ids.
    return {"ok": True, "outcome": outcome.split(":", 1)[0]}
