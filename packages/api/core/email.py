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
# Recruiter-reply forward (AgentMail shared inbox → user's real email). Not in
# _SUBJECTS/send_email: subject and body are per-message, and idempotency is per
# MESSAGE (Redis apply:forward:{message_id}), not per (user, type) — so it has its
# own sender below rather than a claim_email_send row.
EMAIL_RECRUITER_FORWARD = "recruiter_forward"
# OTP heads-up (AgentMail inbox classified a verification-code email): pure
# reassurance, no button, never carries the code. Repeatable per application, so —
# like the forward — deduped by the caller (Redis, per application), not
# claim_email_send.
EMAIL_OTP_NOTICE = "otp_notice"

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


def send_recruiter_forward_email(
    *,
    to: str | None,
    user_id: str | None,
    first_name: str | None,
    company: str | None,
    recruiter_from: str,
    reply_to: str,
    message_text: str,
) -> bool:
    """Forward a recruiter's message from the shared AgentMail inbox to the user's
    real address. Reply-To is the RECRUITER — the user hitting reply talks to them
    directly; Scout is out of the loop from that point.

    Same contract as send_email: NEVER raises, Sentry-logs failures, and logs carry
    user id only — never addresses or message content. The forwarded body is
    HTML-escaped before it touches the template (recruiter content is untrusted)."""
    try:
        if not to or not to.strip():
            logger.warning("Skipping recruiter forward: no recipient (user=%s)", user_id)
            return False
        if not is_configured():
            logger.debug("RESEND_API_KEY unset — skipping recruiter forward")
            return False

        html_template = _load_template(EMAIL_RECRUITER_FORWARD, "html")
        text_template = _load_template(EMAIL_RECRUITER_FORWARD, "txt")
        if not html_template or not text_template:
            logger.error("Recruiter-forward templates missing")
            return False

        company_label = (company or "").strip() or "an employer"
        body = (message_text or "").strip()[:20000]
        variables = {
            "first_name": first_name_from(first_name),
            "company": company_label,
            "sender_line": recruiter_from.strip(),
            "cta_url": _cta_url(),
        }
        # Escaped-token substitution first, then the message body: escaped with real
        # line breaks for HTML, raw for plain text.
        html_body = _substitute(html_template, variables, escape=True).replace(
            "{{message_body}}", html.escape(body, quote=True).replace("\n", "<br />")
        )
        text_body = _substitute(text_template, variables, escape=False).replace(
            "{{message_body}}", body
        )

        import resend  # deferred: only pay the import when a send actually happens

        resend.api_key = os.getenv("RESEND_API_KEY")
        resend.Emails.send(
            {
                "from": FROM_ADDRESS,
                "to": [to.strip()],
                "reply_to": reply_to.strip() or REPLY_TO,
                "subject": f"{company_label} responded to your application",
                "html": html_body,
                "text": text_body,
            }
        )
        logger.info("Sent %s email (user=%s)", EMAIL_RECRUITER_FORWARD, user_id)
        return True
    except Exception as exc:  # noqa: BLE001 — email must never break the caller
        sentry_sdk.set_tag("email_type", EMAIL_RECRUITER_FORWARD)
        sentry_sdk.capture_exception(exc)
        logger.error("Failed to send recruiter forward (user=%s): %s", user_id, exc)
        return False


def send_otp_notice_email(
    *,
    to: str | None,
    user_id: str | None,
    first_name: str | None,
    company: str | None,
) -> bool:
    """Tell the user a verification-code email arrived and Scout's agent is
    handling it — ignore any related mail. Deliberately no CTA button and no code
    content. Same contract as send_email: NEVER raises, logs carry user id only."""
    try:
        if not to or not to.strip():
            logger.warning("Skipping OTP notice: no recipient (user=%s)", user_id)
            return False
        if not is_configured():
            logger.debug("RESEND_API_KEY unset — skipping OTP notice")
            return False

        html_template = _load_template(EMAIL_OTP_NOTICE, "html")
        text_template = _load_template(EMAIL_OTP_NOTICE, "txt")
        if not html_template or not text_template:
            logger.error("OTP-notice templates missing")
            return False

        variables = {
            "first_name": first_name_from(first_name),
            "company": (company or "").strip() or "The employer",
        }

        import resend  # deferred: only pay the import when a send actually happens

        resend.api_key = os.getenv("RESEND_API_KEY")
        resend.Emails.send(
            {
                "from": FROM_ADDRESS,
                "to": [to.strip()],
                "reply_to": REPLY_TO,
                "subject": "Scout is handling a quick verification step",
                "html": _substitute(html_template, variables, escape=True),
                "text": _substitute(text_template, variables, escape=False),
            }
        )
        logger.info("Sent %s email (user=%s)", EMAIL_OTP_NOTICE, user_id)
        return True
    except Exception as exc:  # noqa: BLE001 — email must never break the caller
        sentry_sdk.set_tag("email_type", EMAIL_OTP_NOTICE)
        sentry_sdk.capture_exception(exc)
        logger.error("Failed to send OTP notice (user=%s): %s", user_id, exc)
        return False


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
