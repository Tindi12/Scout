import logging
import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from svix.webhooks import Webhook, WebhookVerificationError

from core.analytics import EVENT_SIGNED_UP, capture
from core.email import try_send_welcome_email
from core.supabase_client import supabase
from services.account_deletion import AccountDeletionError, delete_account_data

load_dotenv()

logger = logging.getLogger(__name__)

CLERK_WEBHOOK_SECRET = os.getenv("CLERK_WEBHOOK_SECRET")

router = APIRouter()


def _insert_user_row(*, clerk_id: str, email: str, name: str) -> str | None:
    """Create the Supabase user row, or fetch the existing one if already provisioned."""
    row = {
        "clerk_id": clerk_id,
        "email": email,
        "name": name,
        "onboarding_complete": False,
        "copilot_messages_used": 0,
    }
    try:
        res = supabase.table("users").insert(row).execute()
        inserted = (res.data or [{}])[0]
        user_id = inserted.get("id")
        if user_id:
            return str(user_id)
    except Exception as exc:
        logger.info(
            "users insert skipped for clerk_id=%s (likely already exists): %s",
            clerk_id,
            exc,
        )

    try:
        res = (
            supabase.table("users")
            .select("id")
            .eq("clerk_id", clerk_id)
            .maybe_single()
            .execute()
        )
        existing = res.data if isinstance(res.data, dict) else None
        user_id = (existing or {}).get("id")
        return str(user_id) if user_id else None
    except Exception as exc:
        logger.error("Failed to resolve user row for clerk_id=%s: %s", clerk_id, exc)
        return None


@router.post("/webhook")
async def clerk_webhook(request: Request) -> dict[str, str]:
    body = await request.body()
    svix_id = request.headers.get("svix-id")
    svix_timestamp = request.headers.get("svix-timestamp")
    svix_signature = request.headers.get("svix-signature")

    if not CLERK_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Missing CLERK_WEBHOOK_SECRET")

    if not svix_id or not svix_timestamp or not svix_signature:
        raise HTTPException(status_code=400, detail="Missing Svix headers")

    headers_dict = {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
    }

    try:
        wh = Webhook(CLERK_WEBHOOK_SECRET)
        payload = wh.verify(body, headers_dict)


    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = payload["type"]

    if event_type == "user.created":
        data = payload["data"]
        clerk_id = data["id"]
        email = data["email_addresses"][0]["email_address"]
        first_name = data["first_name"] or ""
        last_name = data["last_name"] or ""
        name = f"{first_name} {last_name}".strip()

        user_row_id = await run_in_threadpool(
            _insert_user_row,
            clerk_id=clerk_id,
            email=email,
            name=name,
        )
        if not user_row_id:
            raise HTTPException(status_code=500, detail="Database error")

        # Funnel entry point. Clerk is the source of truth for account creation, so
        # firing here (keyed by the Clerk id the browser SDK also identifies with) is
        # more reliable than a client event that a closed tab could drop.
        capture(clerk_id, EVENT_SIGNED_UP, flush=True)

        # Welcome email — side effect only, never blocks the webhook response. The
        # email_sends claim makes Svix redeliveries single-send; claim + send both
        # swallow their own failures by contract (core/email.py).
        await run_in_threadpool(
            try_send_welcome_email,
            user_id=user_row_id,
            to=email,
            first_name=first_name or name,
        )

    elif event_type == "user.updated":
        data = payload["data"]
        clerk_id = data["id"]
        email = data["email_addresses"][0]["email_address"]
        first_name = data["first_name"] or ""
        last_name = data["last_name"] or ""
        name = f"{first_name} {last_name}".strip()

        try:
            supabase.table("users").update(
                {
                    "email": email,
                    "name": name,
                }
            ).eq("clerk_id", clerk_id).execute()
        except Exception as e:
            print(e)
            raise HTTPException(status_code=500, detail="Database error")

    elif event_type == "user.deleted":
        # Safety net: a deletion initiated OUTSIDE the app (Clerk dashboard, Clerk
        # API) still gets the full external+DB cleanup. For the self-serve flow the
        # orchestrator already ran, so this re-run no-ops (idempotent by contract).
        clerk_id = (payload.get("data") or {}).get("id")
        if clerk_id:
            try:
                await run_in_threadpool(delete_account_data, clerk_id)
            except AccountDeletionError as e:
                # Non-2xx so Svix retries — the identity is already gone from Clerk,
                # this webhook is the only remaining trigger for the cleanup.
                logger.error("user.deleted cleanup incomplete for %s: %s", clerk_id, e.steps)
                raise HTTPException(status_code=500, detail="Cleanup incomplete")

    return {"ok": "true"}
