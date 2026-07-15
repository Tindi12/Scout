"""
Marketing broadcast helpers for Resend Segments (separate from transactional email).

Scout already collects newsletter subscribers into RESEND_SEGMENT_ID via
core/newsletter.py. This module is the future-ready sender for:
  - new blog posts
  - major changelog updates
  - product announcements

Design contract:
- NEVER raises — returns a result status so callers (CLI, admin job, Celery task)
  can proceed safely when Resend is down or unset.
- Draft by default: Resend Broadcasts.create with send=False keeps a draft until
  the caller explicitly requests send=True (and optional scheduled_at).
- Does NOT overload core/email.py (transactional-only). Marketing unsubscribes
  use Resend's {{{RESEND_UNSUBSCRIBE_URL}}} merge tag in the announcement template.
- Unset RESEND_API_KEY / RESEND_SEGMENT_ID ⇒ "not_configured" (local-dev safe).
"""
from __future__ import annotations

import html
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

import sentry_sdk
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Match transactional identity so newsletter subscribers hear from the same founder inbox.
FROM_ADDRESS = "Tindi from Scout <tindi@scoutintern.com>"

BroadcastKind = Literal["blog", "changelog", "announcement"]
BroadcastResultStatus = Literal[
    "draft_created",
    "sent",
    "scheduled",
    "not_configured",
    "failed",
]


@dataclass(frozen=True)
class BroadcastResult:
    status: BroadcastResultStatus
    broadcast_id: str | None = None
    detail: str | None = None


_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"


def _api_key() -> str:
    return (os.getenv("RESEND_API_KEY") or "").strip()


def _segment_id() -> str:
    return (os.getenv("RESEND_SEGMENT_ID") or "").strip()


def is_configured() -> bool:
    return bool(_api_key()) and bool(_segment_id())


def _frontend_base() -> str:
    base = (os.getenv("FRONTEND_BASE_URL") or "").rstrip("/")
    return base or "https://scoutintern.com"


@lru_cache(maxsize=None)
def _load_announcement_template(ext: str) -> str | None:
    path = _TEMPLATE_DIR / f"announcement.{ext}"
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        logger.error("Announcement template missing: %s", path.name)
        return None


def _substitute(template: str, variables: dict[str, str], *, escape: bool) -> str:
    out = template
    for key, value in variables.items():
        token = "{{" + key + "}}"
        out = out.replace(token, html.escape(value, quote=True) if escape else value)
    return out


def _render_announcement(
    *,
    headline: str,
    body: str,
    cta_label: str,
    cta_url: str,
) -> tuple[str, str] | None:
    html_tmpl = _load_announcement_template("html")
    text_tmpl = _load_announcement_template("txt")
    if not html_tmpl or not text_tmpl:
        return None
    variables = {
        "headline": headline,
        "body": body,
        "cta_label": cta_label,
        "cta_url": cta_url,
    }
    return (
        _substitute(html_tmpl, variables, escape=True),
        _substitute(text_tmpl, variables, escape=False),
    )


def create_broadcast(
    *,
    subject: str,
    headline: str,
    body: str,
    cta_label: str,
    cta_url: str,
    send: bool = False,
    scheduled_at: str | None = None,
) -> BroadcastResult:
    """Create a Resend broadcast against RESEND_SEGMENT_ID.

    Defaults to draft (send=False). Pass send=True to create-and-send, optionally
    with scheduled_at (natural language or ISO 8601 per Resend).
    """
    if not is_configured():
        logger.debug("Broadcast skipped: Resend not configured")
        return BroadcastResult(status="not_configured")

    rendered = _render_announcement(
        headline=headline,
        body=body,
        cta_label=cta_label,
        cta_url=cta_url,
    )
    if not rendered:
        return BroadcastResult(status="failed", detail="announcement_template_missing")

    html_body, text_body = rendered

    try:
        import resend

        resend.api_key = _api_key()
        params: dict = {
            "segment_id": _segment_id(),
            "from": FROM_ADDRESS,
            "subject": subject,
            "html": html_body,
            "text": text_body,
            "send": bool(send),
        }
        if send and scheduled_at:
            params["scheduled_at"] = scheduled_at

        response = resend.Broadcasts.create(params)
        broadcast_id = None
        if isinstance(response, dict):
            broadcast_id = response.get("id")

        if not send:
            status: BroadcastResultStatus = "draft_created"
        elif scheduled_at:
            status = "scheduled"
        else:
            status = "sent"

        return BroadcastResult(status=status, broadcast_id=broadcast_id)
    except Exception as exc:  # noqa: BLE001
        sentry_sdk.set_tag("broadcast_stage", "create")
        sentry_sdk.capture_exception(exc)
        logger.error("Broadcast create failed: %s", exc)
        return BroadcastResult(status="failed", detail="resend_error")


def announce_blog_post(
    *,
    title: str,
    description: str,
    slug: str,
    send: bool = False,
    scheduled_at: str | None = None,
) -> BroadcastResult:
    """Draft (or send) a newsletter update for a newly published blog post."""
    url = f"{_frontend_base()}/blog/{slug.lstrip('/')}"
    return create_broadcast(
        subject=f"New on the Scout blog: {title}",
        headline=title,
        body=description,
        cta_label="Read the article →",
        cta_url=url,
        send=send,
        scheduled_at=scheduled_at,
    )


def announce_changelog(
    *,
    title: str,
    description: str,
    version: str,
    send: bool = False,
    scheduled_at: str | None = None,
) -> BroadcastResult:
    """Draft (or send) a newsletter update for a major changelog release."""
    url = f"{_frontend_base()}/changelog"
    return create_broadcast(
        subject=f"Scout {version}: {title}",
        headline=f"{title} (v{version})",
        body=description,
        cta_label="View changelog →",
        cta_url=url,
        send=send,
        scheduled_at=scheduled_at,
    )


def announce_product(
    *,
    subject: str,
    headline: str,
    body: str,
    cta_label: str = "Open Scout →",
    cta_url: str | None = None,
    send: bool = False,
    scheduled_at: str | None = None,
) -> BroadcastResult:
    """Draft (or send) a general product announcement to the newsletter segment."""
    return create_broadcast(
        subject=subject,
        headline=headline,
        body=body,
        cta_label=cta_label,
        cta_url=cta_url or f"{_frontend_base()}/",
        send=send,
        scheduled_at=scheduled_at,
    )
