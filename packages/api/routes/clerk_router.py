from fastapi import APIRouter, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError
import os
from dotenv import load_dotenv
from core.supabase_client import supabase

load_dotenv()

CLERK_WEBHOOK_SECRET = os.getenv("CLERK_WEBHOOK_SECRET")

router = APIRouter()


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

        try:
            supabase.table("users").insert(
                {
                    "clerk_id": clerk_id,
                    "email": email,
                    "name": name,
                    "is_pro": False,
                    "onboarding_complete": False,
                    "copilot_messages_used": 0,
                }
            ).execute()
        except Exception as e:
            print(e)
            raise HTTPException(status_code=500, detail="Database error")

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

    return {"ok": "true"}
