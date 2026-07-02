"""
Landing-page newsletter signup: adds the email as a GLOBAL Resend contact, adds it to
the newsletter segment, and fires a one-time confirmation email through core/email.py.

Resend's contact model: contacts are global (no audience/segment id at creation); an
audience is now called a segment, and membership is a separate association added via
Contacts.Segments.add(). The old Audiences.create endpoint is deprecated — do not use
resend.Audiences / resend.Contacts.create({"audience_id": ...}) here.

Fully separate from account creation (routes/clerk_router.py). Scout account signups
are NOT added to this segment, so there is no double-send risk between the account
welcome email and this confirmation. If that ever changes, gate the newsletter
confirmation behind the same segment-membership check `subscribe()` uses below, so an
account signup that also lands in the segment still gets exactly one email.

Idempotency has no DB table of its own: Resend's segment membership is the source of
truth. subscribe() checks membership before adding, so the confirmation email only
fires the first time an address joins the segment (a check-then-add race across two
simultaneous submits of the same address is possible but harmless — worst case two
confirmation emails for one person clicking subscribe twice at once).
"""
from __future__ import annotations

import logging
import os
from typing import Literal

import sentry_sdk
from dotenv import load_dotenv

from core.email import EMAIL_NEWSLETTER_CONFIRM, send_email

load_dotenv()

logger = logging.getLogger(__name__)

SubscribeResult = Literal["subscribed", "already_subscribed", "not_configured", "failed"]

_NOT_FOUND_CODES = {"404", 404}


def _api_key() -> str:
    return (os.getenv("RESEND_API_KEY") or "").strip()


def _segment_id() -> str:
    return (os.getenv("RESEND_SEGMENT_ID") or "").strip()


def is_configured() -> bool:
    return bool(_api_key()) and bool(_segment_id())


def has_api_key() -> bool:
    """Weaker than is_configured(): enough to remove a contact on account deletion,
    which needs no segment id (removing the global contact drops every segment)."""
    return bool(_api_key())


def subscribe(email: str) -> SubscribeResult:
    """Ensure `email` is a global Resend contact, add it to the newsletter segment, and
    send the confirmation email once, on first join only. Never raises — the caller
    (routes/newsletter.py) always gets a result, never an exception, so a Resend outage
    can't break the landing page."""
    if not is_configured():
        logger.debug("Newsletter signup skipped: Resend not configured")
        return "not_configured"

    import resend
    from resend.exceptions import ResendError

    resend.api_key = _api_key()
    segment_id = _segment_id()

    contact_exists = True
    try:
        contact_segments = resend.Contacts.Segments.list({"email": email})
        already_in_segment = any(
            s.get("id") == segment_id for s in contact_segments.get("data", [])
        )
        if already_in_segment:
            return "already_subscribed"
    except ResendError as exc:
        if exc.code in _NOT_FOUND_CODES:
            contact_exists = False  # no contact yet — create one below
        else:
            sentry_sdk.set_tag("newsletter_stage", "lookup")
            sentry_sdk.capture_exception(exc)
            logger.error("Newsletter segment lookup failed: %s", exc)
            return "failed"
    except Exception as exc:  # noqa: BLE001
        sentry_sdk.set_tag("newsletter_stage", "lookup")
        sentry_sdk.capture_exception(exc)
        logger.error("Newsletter segment lookup failed: %s", exc)
        return "failed"

    if not contact_exists:
        try:
            resend.Contacts.create({"email": email})
        except Exception as exc:  # noqa: BLE001
            sentry_sdk.set_tag("newsletter_stage", "create")
            sentry_sdk.capture_exception(exc)
            logger.error("Newsletter contact create failed: %s", exc)
            return "failed"

    try:
        resend.Contacts.Segments.add({"segment_id": segment_id, "email": email})
    except Exception as exc:  # noqa: BLE001
        sentry_sdk.set_tag("newsletter_stage", "segment_add")
        sentry_sdk.capture_exception(exc)
        logger.error("Newsletter segment add failed: %s", exc)
        return "failed"

    # Side effect only — send_email() never raises (core/email.py contract), so a
    # confirmation-send failure never turns a real subscribe into a reported failure.
    send_email(to=email, email_type=EMAIL_NEWSLETTER_CONFIRM)
    return "subscribed"


def remove_contact(email: str) -> None:
    """Delete the GLOBAL Resend contact for `email` (drops segment membership with it).
    Called from the account-deletion orchestrator. Raises on failure, including 'not
    found' — the caller (services/account_deletion.py) classifies that as a no-op skip,
    matching how the other external cleanup steps in that file treat an already-gone
    resource."""
    resend_api_key = _api_key()
    if not resend_api_key:
        return

    import resend

    resend.api_key = resend_api_key
    resend.Contacts.remove(email=email)
