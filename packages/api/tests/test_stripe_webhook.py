"""Regression tests for the Stripe webhook (Epic 10.3 / 10.x bugfix).

Guards the bug where the handlers received Stripe's StripeObject (which, in this SDK
version, does NOT support dict-style .get()) instead of a plain dict — every handler
crashed on its first .get(), the broad except swallowed it, and the webhook returned
200 having written nothing.

These tests drive the real /stripe/webhook route end-to-end with a genuinely signed
payload, so stripe.Webhook.construct_event runs and produces a real StripeObject. If the
dispatch path is ever reverted to use that StripeObject (instead of json.loads(payload)),
the handler will crash and `handled` becomes False / no update is captured — failing here.
"""

import hashlib
import hmac
import json
import os
import time

# Read at import in core.stripe_client; set before importing the app so the signature
# we generate matches what the route verifies against.
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_regression_test")

from fastapi.testclient import TestClient

import main
import routes.stripe_router as sr

_SECRET = os.environ["STRIPE_WEBHOOK_SECRET"]
_client = TestClient(main.app)


def _sign(body: bytes) -> str:
    """Build a Stripe-Signature header the same way Stripe does (HMAC-SHA256 of
    `timestamp.payload`)."""
    ts = int(time.time())
    signed = b"%d.%s" % (ts, body)
    sig = hmac.new(_SECRET.encode(), signed, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def _post_signed(event: dict, captured: list):
    body = json.dumps(event).encode()
    # Capture DB writes instead of performing them (no Supabase/network in unit tests).
    sr._apply_user_update = lambda uid, fields: captured.append((uid, fields))
    return _client.post(
        "/stripe/webhook",
        content=body,
        headers={"stripe-signature": _sign(body)},
    )


def test_checkout_completed_grants_tier_from_real_signed_event():
    captured: list = []
    event = {
        "id": "evt_test_checkout",
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test",
                "metadata": {"scout_user_id": "user-uuid-1", "tier": "pro"},
                "customer": "cus_test",
                "subscription": "sub_test",
            }
        },
    }
    resp = _post_signed(event, captured)
    assert resp.status_code == 200
    assert resp.json()["handled"] is True
    # The regression: a StripeObject would crash here and capture nothing.
    assert captured, "handler must update the user"
    uid, fields = captured[0]
    assert uid == "user-uuid-1"
    assert fields["subscription_plan"] == "pro"
    assert fields["stripe_customer_id"] == "cus_test"
    assert fields["stripe_subscription_id"] == "sub_test"


def test_subscription_deleted_reverts_to_free():
    captured: list = []
    event = {
        "id": "evt_test_deleted",
        "object": "event",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_test",
                "customer": "cus_test",
                "metadata": {"scout_user_id": "user-uuid-1"},
            }
        },
    }
    resp = _post_signed(event, captured)
    assert resp.status_code == 200
    assert resp.json()["handled"] is True
    assert captured, "handler must update the user"
    assert captured[0][1]["subscription_plan"] == "free"


def test_invalid_signature_is_rejected_400():
    body = json.dumps(
        {"type": "checkout.session.completed", "data": {"object": {}}}
    ).encode()
    resp = _client.post(
        "/stripe/webhook",
        content=body,
        headers={"stripe-signature": "t=1,v1=deadbeef"},
    )
    assert resp.status_code == 400
