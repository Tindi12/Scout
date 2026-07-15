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

Fingerprint constraints verified live 2026-07-12, re-confirmed 2026-07-13 (Ashby
spam investigation, session 990b1678 postmortem):
- Within one session the exit IP and fingerprint are STABLE (no rotation), and
  geolocation targeting works (exit IP matched the applicant's city/state).
  navigator.webdriver reads false — Browserbase hides the basic flag even without
  advancedStealth, so CDP-automation detection (Ashby's Fingerprint-vendor bot
  signal) is subtler than webdriver and NOT addressable on this plan.
- The browser presents as Chrome on Linux (X11 UA), platform "Linux x86_64".
  There is NO Developer-plan lever to change the OS/UA: browserSettings os:"windows"
  → 400, advancedStealth → 403, verified:true → 403 — all "Enterprise plan" (probed
  live 2026-07-13). A UA-header-only spoof is deliberately NOT done: platform/WebGL/
  canvas still leak Linux, so a Windows UA would be a WORSE (tampering) mismatch than
  the current consistent-but-Linux state.
- Browserbase applies a browser-level timezone override, observed America/Chicago
  (offset 300 / Central) even with an Indiana-geo proxy — Rochester, IN is EASTERN,
  so this is a browser-tz vs IP-tz mismatch. It is UNFIXABLE from our side on this
  plan: the SDK's browserSettings has no fingerprint/timezone/locale field at all
  (browserbase==1.11.0), browser-use's BrowserProfile has no timezone_id/locale, and
  CDP Emulation.setTimezoneOverride fails BOTH as a bare set AND as clear('')-then-set
  (-32000 "already in effect" — the override is locked above our client CDP session;
  clear('') returns OK but is a no-op, tz stays Chicago). Raise with Browserbase
  support (their geo→tz table mismaps Indiana to Central) or move to Enterprise.
So Linux-UA and tz-mismatch are vendor/plan constraints, not config bugs here, and
both FIX attempts from the 990b1678 postmortem require Enterprise — see the memory
note ashby-spam-fingerprint. Do NOT re-litigate with post-hoc CDP overrides or UA
spoofing; both were tested and are dead ends / counterproductive.

DECISION (2026-07-14, confirmed by live validation): staying on the Developer plan.
Two clean-form Ashby retries (sessions 7ec690a0 / ac28cfc1) ran with block_ads OFF,
a geo-matched residential proxy, all required fields verified by the pre-submit
gate, and a network-confirmed resume upload — Ashby still returned "possible spam"
both times. That isolates the remaining trigger to the plan-gated Linux cloud
fingerprint (+ tz mismatch). Ashby spam is therefore an ACCEPTED outcome handled
product-side: spam_blocked is a non-retryable needs_attention with an
"Apply manually" link in the tracker (see services/application_failure_codes.py
and the web tracker components). Do not add automatic Ashby resubmits.
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
# When on, create_session(geolocation=...) geo-targets the residential exit IP to the
# applicant's city/state — Ashby's one publicly named fraud signal is "location
# mismatch", so a random US IP (proxies=True alone) is itself a tell. A plain
# proxies=True is still used as the fallback when no geolocation is supplied.
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
# (set explicitly to document intent). block_ads lightens heavy pages (fewer DOM
# nodes / network requests → fewer DOM-build timeouts) and stays the default for
# most ATS portals; Ashby opt-outs go through create_session(block_ads=False).
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


def create_session(
    *,
    api_timeout: int = DEFAULT_SESSION_TIMEOUT,
    geolocation: dict | None = None,
    block_ads: bool = True,
):
    """
    Create a hardened Browserbase session with Scout's standard settings.

    Returns the SDK Session (has `.id` and `.connect_url`). The caller owns
    connecting browser-use and releasing the session in a `finally`.

    `geolocation` (e.g. {"city": "Rochester", "state": "IN", "country": "US"}) only
    takes effect when BROWSERBASE_PROXIES is on: it geo-targets the residential exit
    IP to the applicant so the egress location matches the address on the form. When
    proxies are on but no geolocation is given, a plain residential proxy is used.

    `block_ads` defaults True (timeout defense on heavy pages). Ashby runs should
    pass False — see services.browser_session_policy.resolve_block_ads.
    """
    if BROWSERBASE_PROXIES:
        if geolocation:
            extra: dict = {
                "proxies": [{"type": "browserbase", "geolocation": geolocation}]
            }
        else:
            extra = {"proxies": True}
    else:
        extra = {}

    browser_settings = {
        **_BROWSER_SETTINGS,
        "block_ads": bool(block_ads),
    }

    session = get_client().sessions.create(
        project_id=BROWSERBASE_PROJECT_ID,
        api_timeout=api_timeout,
        region=BROWSERBASE_REGION,
        browser_settings=browser_settings,
        **extra,
    )
    if not BROWSERBASE_PROXIES:
        proxy_state = "off"
    elif geolocation:
        loc = ", ".join(
            str(geolocation[k]) for k in ("city", "state", "country") if geolocation.get(k)
        )
        proxy_state = f"geo({loc})"
    else:
        proxy_state = "on(ungeo)"
    logger.info(
        "Browserbase session created: %s (region=%s, timeout=%ss, block_ads=%s, proxies=%s)",
        session.id,
        BROWSERBASE_REGION,
        api_timeout,
        "on" if block_ads else "off",
        proxy_state,
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
