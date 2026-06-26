"""
Sentry error monitoring for the FastAPI app AND the Celery workers (Epic 11.5).

Design:
- NO-OP when SENTRY_DSN is unset (local dev): sentry_sdk.init() with no dsn is a
  silent no-op, so nothing here crashes or spams when Sentry isn't configured.
- One init covers BOTH process types. The Celery worker imports the FastAPI route
  chain (and vice versa), so init_sentry() is called from main.py AND celery_app.py;
  the module-level guard makes the second call a no-op. We register the FastAPI,
  Starlette, and Celery integrations every time so whichever entrypoint wins still
  instruments both surfaces.
- PII scrubbing is mandatory: Scout handles resumes, personal info, answers, and
  payment data. send_default_pii=False keeps request bodies/headers off events, and
  before_send() strips anything sensitive that could still slip through.

Tunables (all read from env, safe defaults):
- SENTRY_DSN                  — unset ⇒ Sentry disabled.
- SENTRY_ENVIRONMENT          — "development" (default) / "production"; tags events.
- SENTRY_TRACES_SAMPLE_RATE   — performance sampling, default 0.1 (keep low = cheap).
"""
import logging
import os

import sentry_sdk
from dotenv import load_dotenv
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

load_dotenv()

logger = logging.getLogger(__name__)

_initialized = False

# Header/cookie names that must never reach Sentry (auth tokens + webhook secrets).
_SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "stripe-signature",
    "x-scout-internal",
    "x-clerk-user-id",
    "x-api-key",
}

# Substrings of context keys whose VALUES are PII/secret and should be redacted
# wherever they appear in event "extra"/context dicts.
_SENSITIVE_KEY_HINTS = (
    "resume",
    "parsed_content",
    "rewritten",
    "cover_letter",
    "answers",
    "password",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "dsn",
)

_REDACTED = "[redacted]"


def _scrub_headers(headers: dict) -> dict:
    return {
        k: (_REDACTED if k.lower() in _SENSITIVE_HEADERS else v)
        for k, v in headers.items()
    }


def _looks_sensitive(key: str) -> bool:
    k = key.lower()
    return any(hint in k for hint in _SENSITIVE_KEY_HINTS)


def _scrub_mapping(obj):
    """Recursively redact sensitive keys in dicts/lists from event context."""
    if isinstance(obj, dict):
        return {
            k: (_REDACTED if _looks_sensitive(str(k)) else _scrub_mapping(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_scrub_mapping(v) for v in obj]
    return obj


def _before_send(event, hint):
    """Last-line PII/secret scrub before any event leaves the process."""
    request = event.get("request")
    if isinstance(request, dict):
        # Never ship the request body (resume content, answers, personal data).
        request.pop("data", None)
        request.pop("cookies", None)
        if isinstance(request.get("headers"), dict):
            request["headers"] = _scrub_headers(request["headers"])
    # Scrub our own added context / extras.
    if isinstance(event.get("extra"), dict):
        event["extra"] = _scrub_mapping(event["extra"])
    if isinstance(event.get("contexts"), dict):
        event["contexts"] = _scrub_mapping(event["contexts"])
    return event


def init_sentry() -> None:
    """Initialize Sentry once per process. Safe to call from both entrypoints; a
    missing SENTRY_DSN makes this a clean no-op."""
    global _initialized
    if _initialized:
        return

    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        # Local dev / DSN not provisioned yet: stay silent, don't instrument.
        _initialized = True
        return

    environment = (os.getenv("SENTRY_ENVIRONMENT") or "development").strip()
    try:
        traces_sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
    except ValueError:
        traces_sample_rate = 0.1

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        traces_sample_rate=traces_sample_rate,
        # Do NOT attach user IP / request bodies / cookies automatically.
        send_default_pii=False,
        before_send=_before_send,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            # Captures uncaught task exceptions. NOTE: apply_to_job_task catches its
            # own exceptions, so those are reported explicitly via capture_exception
            # in tasks/job_tasks.py — the integration alone wouldn't see them.
            CeleryIntegration(),
        ],
    )
    _initialized = True
    logger.info("Sentry initialized (environment=%s)", environment)
