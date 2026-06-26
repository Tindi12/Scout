"""PostHog product analytics — server-side capture (Epic 11.6).

Used for the events that must be reliable and can't be trusted to the browser:
- subscription_activated  — fired from the Stripe webhook (payment source of truth).
- application_completed    — fired from the apply task, only when an application truly
                             reaches "applied" status (never from optimistic UI).
- signed_up                — fired from the Clerk webhook (account-creation source of
                             truth).

Design mirrors core/observability.py (Sentry):
- NO-OP when POSTHOG_KEY is unset (local dev): the client is never created and every
  helper short-circuits, so nothing crashes, blocks, or spams.
- distinct_id is ALWAYS the Clerk user id, so server events tie to the same person the
  browser SDK identifies — funnels stitch across client and server.
- Privacy: never pass resume / answer / message / personal-contact content. Identify by
  id + coarse properties (tier, portal, etc.) only.
"""

import logging
import os

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Canonical server-emitted event names (snake_case). These mirror the names in the
# frontend catalog (packages/web/lib/analytics.ts) so client+server events line up in
# the same PostHog funnel.
EVENT_SIGNED_UP = "signed_up"
EVENT_APPLICATION_COMPLETED = "application_completed"
EVENT_SUBSCRIPTION_ACTIVATED = "subscription_activated"

_DEFAULT_HOST = "https://us.i.posthog.com"

_client = None
_initialized = False


def _get_client():
    """Lazily build the PostHog client once. Returns None (disabled) when no key is
    configured or init fails — callers treat None as a silent no-op."""
    global _client, _initialized
    if _initialized:
        return _client

    _initialized = True
    key = (os.getenv("POSTHOG_KEY") or "").strip()
    if not key:
        logger.info("PostHog disabled (POSTHOG_KEY unset)")
        _client = None
        return None

    try:
        from posthog import Posthog

        _client = Posthog(
            project_api_key=key,
            host=(os.getenv("POSTHOG_HOST") or _DEFAULT_HOST).strip(),
            # The request originates from our server, not the user — don't geo-locate
            # events by the server's IP.
            disable_geoip=True,
        )
        logger.info("PostHog initialized (server-side)")
    except Exception as exc:  # never let analytics setup break startup
        logger.warning("PostHog init failed: %s", exc)
        _client = None

    return _client


def capture(distinct_id, event, properties=None, *, flush=False):
    """Capture a server-side event for the given Clerk user id.

    No-ops when PostHog is unconfigured or distinct_id is missing. Never raises —
    analytics must not break a webhook or a Celery task. Pass flush=True for
    payment/accuracy-critical events so they're delivered promptly even if the process
    is about to go idle.
    """
    client = _get_client()
    if client is None or not distinct_id:
        return
    try:
        client.capture(event, distinct_id=distinct_id, properties=properties or {})
        if flush:
            client.flush()
    except Exception as exc:
        logger.warning("PostHog capture failed (event=%s): %s", event, exc)


def set_user_properties(distinct_id, properties):
    """Update a user's PostHog person properties (e.g. subscription_plan on upgrade)
    without emitting a counted event. Keeps tier-based segmentation accurate the moment
    a plan changes server-side. No-ops when unconfigured."""
    client = _get_client()
    if client is None or not distinct_id or not properties:
        return
    try:
        client.set(distinct_id=distinct_id, properties=properties)
        client.flush()
    except Exception as exc:
        logger.warning("PostHog set properties failed: %s", exc)
