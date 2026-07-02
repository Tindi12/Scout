"""
User credential endpoints — the USAJobs login (email + password) and the Composio
mail connection (Gmail/Outlook, read-only, for ATS verification codes).

The USAJobs password is symmetric-encrypted (core/crypto.py) before it touches
Supabase, so only ciphertext is stored. This endpoint is the single encrypt-on-write
path: the key (USAJOBS_ENC_KEY) lives only in the FastAPI/Railway environment, which
is why this write goes through FastAPI instead of a Next.js server action. The mail
connection lives here for the same reason — COMPOSIO_API_KEY is Railway-only, and the
OAuth token itself never touches Scout at all (Composio holds it; we store only the
provider, the mailbox address, and Composio's connected-account id).

Security invariants:
- The USAJobs password (plaintext OR ciphertext) is NEVER returned in any response —
  GET exposes only a `has_password` boolean and the (non-secret) email.
- The request body is NEVER logged.
- Mail access is read-only by construction (core/composio_mail.py allowlist).
"""
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from core import composio_mail
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


# ── Mail connection (Composio managed OAuth, read-only) ──────────────────────────────

_MAIL_COLUMNS = "mail_provider, mail_address, mail_connected_at, composio_account_id"


class MailConnectRequest(BaseModel):
    provider: str  # 'google' | 'microsoft'
    return_to: str | None = None  # '/settings' (default) or '/dashboard' after OAuth


_MAIL_RETURN_PATHS = frozenset({"/settings", "/dashboard"})


def _web_origin() -> str:
    """Where Composio sends the user after its consent screen. Explicit env first,
    else the first CORS origin (the web app)."""
    explicit = os.getenv("SCOUT_WEB_URL", "").strip().rstrip("/")
    if explicit:
        return explicit
    origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    return origins[0].rstrip("/") if origins else ""


def _mail_callback_url(return_to: str | None) -> str | None:
    """Composio redirect after consent. Path is allowlisted — no open redirects."""
    origin = _web_origin()
    if not origin:
        return None
    path = (return_to or "/settings").strip()
    if path not in _MAIL_RETURN_PATHS:
        path = "/settings"
    return f"{origin}{path}?mail_connected=1"


def _fetch_mail_row(sub: str) -> dict | None:
    res = (
        supabase.table("users")
        .select(_MAIL_COLUMNS)
        .eq("clerk_id", sub)
        .maybe_single()
        .execute()
    )
    return res.data if res else None


def _mail_state(row: dict | None) -> dict:
    row = row or {}
    return {
        "connected": bool(row.get("mail_connected_at")),
        "pending": bool(row.get("composio_account_id")) and not row.get("mail_connected_at"),
        "provider": row.get("mail_provider"),
        "address": row.get("mail_address"),
        "connected_at": row.get("mail_connected_at"),
        "available": composio_mail.is_configured(),
    }


@router.get("/mail-connection")
async def get_mail_connection(user: dict = Depends(verify_resume_api_user)) -> dict:
    """Connection state, self-syncing: after the OAuth redirect the row is still
    pending — poll Composio once and finalize (address + connected_at) when ACTIVE."""
    sub = user["sub"]

    def _sync() -> dict:
        row = _fetch_mail_row(sub)
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")

        account_id = row.get("composio_account_id")
        if account_id and not row.get("mail_connected_at"):
            try:
                status = composio_mail.get_connection_status(account_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Composio status check failed: %s", exc)
                status = ""
            if status == "ACTIVE":
                address = composio_mail.fetch_mailbox_address(
                    sub, row.get("mail_provider") or composio_mail.PROVIDER_GOOGLE
                )
                updates = {
                    "mail_connected_at": datetime.now(timezone.utc).isoformat(),
                    "mail_address": address,
                }
                supabase.table("users").update(updates).eq("clerk_id", sub).execute()
                row = {**row, **updates}
            elif status in {"FAILED", "EXPIRED", "REVOKED", "INACTIVE"}:
                # e.g. a locked Microsoft tenant requiring admin consent — clear the
                # pending state so the UI offers a clean retry (manual codes still work).
                supabase.table("users").update({
                    "mail_provider": None,
                    "composio_account_id": None,
                }).eq("clerk_id", sub).execute()
                row = {**row, "mail_provider": None, "composio_account_id": None}
        return _mail_state(row)

    return await run_in_threadpool(_sync)


@router.post("/mail-connection")
async def start_mail_connection(
    payload: MailConnectRequest,
    user: dict = Depends(verify_resume_api_user),
) -> dict:
    """Begin Composio's hosted OAuth; returns the consent-screen URL to redirect to."""
    sub = user["sub"]
    provider = payload.provider.strip().lower()
    if provider not in (composio_mail.PROVIDER_GOOGLE, composio_mail.PROVIDER_MICROSOFT):
        raise HTTPException(status_code=422, detail="provider must be 'google' or 'microsoft'")
    if not composio_mail.is_configured():
        raise HTTPException(
            status_code=503, detail="Mail connection is not configured on this server"
        )

    def _start() -> dict:
        if _fetch_mail_row(sub) is None:
            raise HTTPException(status_code=404, detail="User not found")
        callback = _mail_callback_url(payload.return_to)
        try:
            conn = composio_mail.initiate_connection(sub, provider, callback)
        except Exception as exc:  # noqa: BLE001
            logger.error("Composio initiate failed (%s): %s", provider, exc)
            raise HTTPException(
                status_code=502, detail="Could not start the email connection"
            ) from exc
        supabase.table("users").update({
            "mail_provider": provider,
            "mail_address": None,
            "mail_connected_at": None,
            "composio_account_id": conn["connection_id"],
        }).eq("clerk_id", sub).execute()
        return {"redirect_url": conn["redirect_url"]}

    return await run_in_threadpool(_start)


@router.delete("/mail-connection")
async def delete_mail_connection(user: dict = Depends(verify_resume_api_user)) -> dict:
    """Disconnect: revoke on Composio (best-effort) and clear the stored linkage."""
    sub = user["sub"]

    def _disconnect() -> dict:
        row = _fetch_mail_row(sub)
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        account_id = row.get("composio_account_id")
        if account_id:
            try:
                composio_mail.disconnect(account_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Composio disconnect failed (clearing locally): %s", exc)
        supabase.table("users").update({
            "mail_provider": None,
            "mail_address": None,
            "mail_connected_at": None,
            "composio_account_id": None,
        }).eq("clerk_id", sub).execute()
        return {"ok": True, **_mail_state(None)}

    return await run_in_threadpool(_disconnect)


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
