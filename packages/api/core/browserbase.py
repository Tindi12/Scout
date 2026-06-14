"""
Centralized Browserbase session creation — one source of truth for how every
Scout browser session is configured. (Historically the Playwright adapter path
and the AI-agent path each created their own sessions and silently drifted
apart; the adapters are gone, but keep all session config here.)

Investigated 2026-06-10 against scout-dev's Browserbase project: the infra is
healthy — paid plan (25 concurrency), 6h default session timeout, recent sessions
all ended COMPLETED (none TIMED_OUT/ERROR). The recurring failure is our
automation spinning on DOM introspection on heavy pages, not session rot.
`block_ads` lightens pages (fewer network requests + smaller DOM), which is the
one session-level lever that reduces those ax_tree/DOM-build timeouts.
"""
from __future__ import annotations

import logging
import os

from browserbase import Browserbase
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY")
BROWSERBASE_PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID")
# Region is overridable: every CDP round-trip pays worker<->region latency and we
# issue thousands per apply. Default matches Browserbase's own default (us-west-2)
# so this change is a no-op until someone sets BROWSERBASE_REGION.
BROWSERBASE_REGION = os.getenv("BROWSERBASE_REGION", "us-west-2")
# Residential proxy routing (Browserbase-managed pool). A datacenter egress IP is
# one of the strongest ATS spam signals — Ashby rejected an otherwise-clean
# 2026-06-11 submission as "possible spam" with the default AWS IP. Off by default
# because proxied traffic bills per GB (an apply session with block_ads on is a few
# MB, so pennies); set BROWSERBASE_PROXIES=true to enable.
BROWSERBASE_PROXIES = os.getenv("BROWSERBASE_PROXIES", "").strip().lower() in {"1", "true", "yes", "on"}

if not BROWSERBASE_API_KEY:
    raise RuntimeError("BROWSERBASE_API_KEY not set")
if not BROWSERBASE_PROJECT_ID:
    raise RuntimeError("BROWSERBASE_PROJECT_ID not set")

# Hard session lifetime (seconds). Bounds cost/leaks vs. the 6h project default,
# and must stay ABOVE the whole task budget ladder: agent run cap 840 < apply
# pipeline 870 < Celery soft 900 < hard 960 < this. 1260s = 21min, sized so a run
# parked in awaiting_code (verification-code relay, up to ~6 min of waiting) never
# has its browser killed underneath it.
DEFAULT_SESSION_TIMEOUT = int(os.getenv("BROWSERBASE_SESSION_TIMEOUT", "1260"))

# Applied to every session. solve_captchas is already true by default on our plan
# (set explicitly to document intent); block_ads is the real win — lighter pages
# mean fewer DOM nodes / network requests and so fewer DOM-build timeouts.
_BROWSER_SETTINGS = {
    "solve_captchas": True,
    "block_ads": True,
}

_client: Browserbase | None = None


def get_client() -> Browserbase:
    """Process-wide Browserbase client (lazy singleton)."""
    global _client
    if _client is None:
        _client = Browserbase(api_key=BROWSERBASE_API_KEY)
    return _client


def create_session(*, api_timeout: int = DEFAULT_SESSION_TIMEOUT):
    """
    Create a hardened Browserbase session with Scout's standard settings.

    Returns the SDK Session (has `.id` and `.connect_url`). The caller owns
    connecting browser-use and releasing the session in a `finally`.
    """
    extra: dict = {"proxies": True} if BROWSERBASE_PROXIES else {}
    session = get_client().sessions.create(
        project_id=BROWSERBASE_PROJECT_ID,
        api_timeout=api_timeout,
        region=BROWSERBASE_REGION,
        browser_settings=_BROWSER_SETTINGS,
        **extra,
    )
    logger.info(
        "Browserbase session created: %s (region=%s, timeout=%ss, block_ads=on, proxies=%s)",
        session.id,
        BROWSERBASE_REGION,
        api_timeout,
        "on" if BROWSERBASE_PROXIES else "off",
    )
    return session


def release_session(session_id: str | None) -> None:
    """Best-effort release of a Browserbase session. Never raises."""
    if not session_id:
        return
    try:
        get_client().sessions.update(session_id, status="REQUEST_RELEASE")
    except Exception:
        logger.debug("Browserbase release failed for %s", session_id, exc_info=True)
