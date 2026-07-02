"""Tests for POST /stripe/confirm-checkout-session (welcome-page fallback)."""

import os

os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_regression_test")
os.environ["SENTRY_DSN"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import routes.stripe_router as sr  # noqa: E402
from core.auth import verify_resume_api_user  # noqa: E402

_SECRET = os.environ.get("SCOUT_INTERNAL_API_SECRET", "test-internal-secret")
_CLERK = "user_confirm_checkout"

client = TestClient(main.app)


def _headers() -> dict:
    return {"X-Scout-Internal": _SECRET, "X-Clerk-User-Id": _CLERK}


@pytest.fixture(autouse=True)
def _auth_bypass(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main.app, "dependency_overrides", {})
    main.app.dependency_overrides[verify_resume_api_user] = lambda: {"sub": _CLERK}
    yield
    main.app.dependency_overrides.clear()


def _paid_session() -> dict:
    return {
        "id": "cs_test_confirm",
        "mode": "subscription",
        "payment_status": "paid",
        "status": "complete",
        "customer": "cus_test",
        "subscription": "sub_test",
        "metadata": {"scout_user_id": "user-uuid-1", "tier": "pro"},
    }


def test_confirm_checkout_session_grants_tier_when_webhook_missing(
    monkeypatch: pytest.MonkeyPatch,
):
    user_row = {
        "id": "user-uuid-1",
        "email": "a@example.com",
        "stripe_customer_id": "cus_test",
        "subscription_plan": "free",
        "stripe_subscription_id": None,
    }
    captured: list = []

    monkeypatch.setattr(sr, "_fetch_user_billing", lambda _cid: user_row)
    monkeypatch.setattr(
        sr,
        "stripe_client",
        type(
            "Stripe",
            (),
            {
                "v1": type(
                    "V1",
                    (),
                    {
                        "checkout": type(
                            "Checkout",
                            (),
                            {
                                "sessions": type(
                                    "Sessions",
                                    (),
                                    {"retrieve": staticmethod(lambda _sid: _paid_session())},
                                )()
                            },
                        )()
                    },
                )()
            },
        )(),
    )
    monkeypatch.setattr(
        sr,
        "_activate_from_completed_checkout",
        lambda session, *, source: captured.append((session, source)) or "pro",
    )

    res = client.post(
        "/stripe/confirm-checkout-session",
        json={"session_id": "cs_test_confirm"},
        headers=_headers(),
    )

    assert res.status_code == 200
    body = res.json()
    assert body["subscription_plan"] == "pro"
    assert body["activated"] is True
    assert body["already_active"] is False
    assert captured[0][1] == "confirm-checkout-session"


def test_confirm_checkout_session_already_active_short_circuits(
    monkeypatch: pytest.MonkeyPatch,
):
    user_row = {
        "id": "user-uuid-1",
        "email": "a@example.com",
        "stripe_customer_id": "cus_test",
        "subscription_plan": "pro",
        "stripe_subscription_id": "sub_test",
    }
    monkeypatch.setattr(sr, "_fetch_user_billing", lambda _cid: user_row)

    called = {"retrieve": False}

    def _retrieve(_sid: str):
        called["retrieve"] = True
        return _paid_session()

    monkeypatch.setattr(
        sr,
        "stripe_client",
        type(
            "Stripe",
            (),
            {
                "v1": type(
                    "V1",
                    (),
                    {
                        "checkout": type(
                            "Checkout",
                            (),
                            {
                                "sessions": type(
                                    "Sessions",
                                    (),
                                    {"retrieve": staticmethod(_retrieve)},
                                )()
                            },
                        )()
                    },
                )()
            },
        )(),
    )

    res = client.post(
        "/stripe/confirm-checkout-session",
        json={"session_id": "cs_test_confirm"},
        headers=_headers(),
    )

    assert res.status_code == 200
    body = res.json()
    assert body["subscription_plan"] == "pro"
    assert body["already_active"] is True
    assert called["retrieve"] is False


def test_confirm_checkout_session_rejects_foreign_session(
    monkeypatch: pytest.MonkeyPatch,
):
    user_row = {
        "id": "user-uuid-2",
        "email": "b@example.com",
        "stripe_customer_id": "cus_other",
        "subscription_plan": "free",
        "stripe_subscription_id": None,
    }
    session = _paid_session()
    session["metadata"] = {"scout_user_id": "user-uuid-1", "tier": "pro"}
    session["customer"] = "cus_test"

    monkeypatch.setattr(sr, "_fetch_user_billing", lambda _cid: user_row)
    monkeypatch.setattr(
        sr,
        "stripe_client",
        type(
            "Stripe",
            (),
            {
                "v1": type(
                    "V1",
                    (),
                    {
                        "checkout": type(
                            "Checkout",
                            (),
                            {
                                "sessions": type(
                                    "Sessions",
                                    (),
                                    {"retrieve": staticmethod(lambda _sid: session)},
                                )()
                            },
                        )()
                    },
                )()
            },
        )(),
    )

    res = client.post(
        "/stripe/confirm-checkout-session",
        json={"session_id": "cs_test_confirm"},
        headers=_headers(),
    )

    assert res.status_code == 403
