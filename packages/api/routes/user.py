"""
User credential endpoints — the USAJobs login (email + password).

The USAJobs password is symmetric-encrypted (core/crypto.py) before it touches
Supabase, so only ciphertext is stored. This endpoint is the single encrypt-on-write
path: the key (USAJOBS_ENC_KEY) lives only in the FastAPI/Railway environment, which
is why this write goes through FastAPI instead of a Next.js server action.

Security invariants:
- The USAJobs password (plaintext OR ciphertext) is NEVER returned in any response —
  GET exposes only a `has_password` boolean and the (non-secret) email.
- The request body is NEVER logged.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from core.auth import verify_internal_service, verify_resume_api_user
from core.crypto import encrypt_usajobs_password
from core.email import try_send_welcome_email
from core.supabase_client import supabase

logger = logging.getLogger(__name__)

router = APIRouter()


class UsajobsCredentials(BaseModel):
    # Both optional so a caller can update either field independently. We use
    # model_fields_set to tell "omitted" (leave unchanged) apart from "" (clear).
    usajobs_email: str | None = None
    usajobs_password: str | None = None


def _fetch_user_row(sub: str) -> dict | None:
    res = (
        supabase.table("users")
        .select("usajobs_email, usajobs_password")
        .eq("clerk_id", sub)
        .maybe_single()
        .execute()
    )
    return res.data if res else None


def _credentials_state(row: dict | None) -> dict:
    """Public, password-free view of the stored credentials."""
    row = row or {}
    pw = row.get("usajobs_password")
    return {
        "has_password": bool(pw and str(pw).strip()),
        "usajobs_email": row.get("usajobs_email"),
    }


@router.get("/usajobs-credentials")
async def get_usajobs_credentials(user: dict = Depends(verify_resume_api_user)) -> dict:
    sub = user["sub"]
    row = await run_in_threadpool(_fetch_user_row, sub)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _credentials_state(row)


@router.put("/usajobs-credentials")
async def put_usajobs_credentials(
    payload: UsajobsCredentials,
    user: dict = Depends(verify_resume_api_user),
) -> dict:
    sub = user["sub"]
    provided = payload.model_fields_set

    updates: dict[str, object] = {}

    if "usajobs_email" in provided:
        email = (payload.usajobs_email or "").strip()
        updates["usajobs_email"] = email or None

    if "usajobs_password" in provided:
        # Empty string explicitly clears the credential (stores NULL); a real value
        # is encrypted before storage. Encryption failure (missing/invalid key) is a
        # server misconfiguration — surface 500, never fall back to plaintext.
        raw = payload.usajobs_password or ""
        if raw.strip():
            try:
                updates["usajobs_password"] = encrypt_usajobs_password(raw)
            except RuntimeError as exc:
                logger.error("USAJobs password encryption unavailable: %s", exc)
                raise HTTPException(
                    status_code=500,
                    detail="Server is not configured to store credentials securely.",
                ) from exc
        else:
            updates["usajobs_password"] = None

    if not updates:
        row = await run_in_threadpool(_fetch_user_row, sub)
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        return {"ok": True, **_credentials_state(row)}

    def _update_and_read() -> dict | None:
        res = (
            supabase.table("users")
            .update(updates)
            .eq("clerk_id", sub)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None

    updated = await run_in_threadpool(_update_and_read)
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, **_credentials_state(updated)}


class WelcomeEmailRequest(BaseModel):
    user_id: str
    email: str
    first_name: str | None = None


@router.post(
    "/welcome-email",
    dependencies=[Depends(verify_internal_service)],
)
async def send_welcome_email(body: WelcomeEmailRequest) -> dict[str, bool]:
    """Fallback when the Next.js app provisions a user before Clerk's webhook arrives."""
    sent = await run_in_threadpool(
        try_send_welcome_email,
        user_id=body.user_id.strip(),
        to=body.email.strip(),
        first_name=body.first_name,
    )
    return {"sent": sent}
