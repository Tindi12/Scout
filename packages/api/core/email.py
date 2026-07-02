"""
The ONE place Scout sends transactional email (Resend). Don't scatter sends.

Templates are precompiled artifacts in templates/email/ (*.html + *.txt), built from
the React Email components in packages/emails — edit the .tsx there, run
`pnpm --filter emails build`, and commit the regenerated artifacts. The API never
renders React; it only substitutes the {{first_name}} / {{cta_url}} tokens.

Contract (matters more than the emails themselves):
- Email is a SIDE EFFECT. send_email() NEVER raises — a failed send logs loudly to
  Sentry and returns False, and the surrounding flow (signup, payment grant, account
  deletion) proceeds regardless. Never gate a core action on an email.
- Idempotency: claim_email_send() claims (user_id, email_type) in email_sends BEFORE
  sending (insert, ignore-duplicates). Redelivered webhooks (Clerk Svix, Stripe) can
  never double-send. Claim-first means a crash mid-send costs one missed email — the
  right trade for greeting/thanks mail, where a duplicate is worse than an absence.
- Privacy: logs and Sentry events carry user ids and email types only — never
  addresses, names, or message bodies.
"""
from __future__ import annotations

import html
import logging
import os
from functools import lru_cache
from pathlib import Path

import sentry_sdk
from dotenv import load_dotenv

from core.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

# Founder voice: real address, real inbox — users can reply and reach Tindi.
FROM_ADDRESS = "Tindi from Scout <tindi@scoutintern.com>"
REPLY_TO = "tindi@scoutintern.com"

EMAIL_WELCOME = "welcome"
EMAIL_UPGRADE_PRO = "upgrade_pro"
EMAIL_UPGRADE_SCOUT_PLUS = "upgrade_scout_plus"
EMAIL_FAREWELL = "farewell"
EMAIL_NEWSLETTER_CONFIRM = "newsletter_confirm"

_SUBJECTS = {
    EMAIL_WELCOME: "Welcome to Scout: here's your first move",
    EMAIL_UPGRADE_PRO: "Thank you, seriously",
    EMAIL_UPGRADE_SCOUT_PLUS: "Thank you, seriously",
    EMAIL_FAREWELL: "Your Scout account has been deleted",
    EMAIL_NEWSLETTER_CONFIRM: "You're on the list",
}

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"


def is_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY"))


def first_name_from(full_name: str | None) -> str:
    """First token of the stored full name, with the copy's fallback greeting."""
    tokens = (full_name or "").strip().split()
    return tokens[0] if tokens else "there"


def _cta_url() -> str:
    base = (os.getenv("FRONTEND_BASE_URL") or "").rstrip("/")
    return f"{base}/dashboard" if base else "https://scoutintern.com/dashboard"


@lru_cache(maxsize=None)
def _load_template(email_type: str, ext: str) -> str | None:
    path = _TEMPLATE_DIR / f"{email_type}.{ext}"
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        logger.error("Email template missing: %s", path.name)
        return None


def _substitute(template: str, variables: dict[str, str], *, escape: bool) -> str:
    """Token replacement. HTML bodies escape the values (a name like `O'Brien <3`
    must never inject markup); plain-text bodies take them raw."""
    out = template
    for key, value in variables.items():
        out = out.replace(
            "{{" + key + "}}", html.escape(value, quote=True) if escape else value
        )
    return out


def try_send_welcome_email(
    *,
    user_id: str | None,
    to: str | None,
    first_name: str | None = None,
) -> bool:
    """Idempotent welcome send — safe to call from Clerk webhook and signup fallbacks."""
    if not user_id:
        return False
    if not claim_email_send(user_id, EMAIL_WELCOME):
        return False
    return send_email(
        to=to,
        email_type=EMAIL_WELCOME,
        first_name=first_name,
        user_id=user_id,
    )


def claim_email_send(user_id: str, email_type: str) -> bool:
    """True when this call WON the (user, email_type) claim and should send; False if
    it was already claimed (or the claim itself failed — skipping beats duplicating).
    Never raises."""
    try:
        res = (
            supabase.table("email_sends")
            .upsert(
                {"user_id": user_id, "email_type": email_type},
                on_conflict="user_id,email_type",
                ignore_duplicates=True,
            )
            .execute()
        )
        return bool(res.data)
    except Exception as exc:  # noqa: BLE001
        logger.error("email_sends claim failed (%s, user=%s): %s", email_type, user_id, exc)
        return False


def send_email(
    *,
    to: str | None,
    email_type: str,
    first_name: str | None = None,
    user_id: str | None = None,
) -> bool:
    """Send one transactional email. NEVER raises; returns whether it was sent.
    Unset RESEND_API_KEY (local dev) is a silent no-op."""
    try:
        if not to or not to.strip():
            logger.warning("Skipping %s email: no recipient (user=%s)", email_type, user_id)
            return False
        if not is_configured():
            logger.debug("RESEND_API_KEY unset — skipping %s email", email_type)
            return False

        subject = _SUBJECTS.get(email_type)
        html_template = _load_template(email_type, "html")
        text_template = _load_template(email_type, "txt")
        if not subject or not html_template or not text_template:
            logger.error("Email type %s is not fully configured", email_type)
            return False

        variables = {
            "first_name": first_name_from(first_name),
            "cta_url": _cta_url(),
        }

        import resend  # deferred: only pay the import when a send actually happens

        resend.api_key = os.getenv("RESEND_API_KEY")
        resend.Emails.send(
            {
                "from": FROM_ADDRESS,
                "to": [to.strip()],
                "reply_to": REPLY_TO,
                "subject": subject,
                "html": _substitute(html_template, variables, escape=True),
                "text": _substitute(text_template, variables, escape=False),
            }
        )
        logger.info("Sent %s email (user=%s)", email_type, user_id)
        return True
    except Exception as exc:  # noqa: BLE001 — email must never break the caller
        sentry_sdk.set_tag("email_type", email_type)
        sentry_sdk.capture_exception(exc)
        logger.error("Failed to send %s email (user=%s): %s", email_type, user_id, exc)
        return False
