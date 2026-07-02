"""Account-deletion endpoint safety properties.

Hermetic (no Supabase/Stripe/Composio network): the orchestrator's step functions are
monkeypatched at the module level, but auth, routing, and the abort-before-DB ordering
run for real. The properties proven here are the ones that make deletion safe to ship:

1. No auth → 401. Deletion is impossible without an authenticated identity.
2. Already-deleted user → clean success (idempotent retry after a partial failure).
3. An external step failure ABORTS before the users row is deleted, returns 502 with
   the per-step report, and never reports a silent partial success.
"""
import os

os.environ.setdefault("SCOUT_INTERNAL_API_SECRET", "test-internal-secret")
# The abort path calls sentry_sdk.capture_exception on purpose; a real DSN from .env
# would ship those synthetic failures to Sentry. Empty string disables init cleanly
# (load_dotenv never overrides an existing value).
os.environ["SENTRY_DSN"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from stripe import StripeError  # noqa: E402

import main  # noqa: E402
import services.account_deletion as deletion  # noqa: E402

_SECRET = os.environ["SCOUT_INTERNAL_API_SECRET"]

client = TestClient(main.app)


def _headers(clerk_id: str) -> dict:
    return {"X-Scout-Internal": _SECRET, "X-Clerk-User-Id": clerk_id}


def test_delete_requires_auth():
    res = client.post("/account/delete")
    assert res.status_code == 401


def test_already_deleted_user_is_idempotent_success(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(deletion, "_fetch_deletion_row", lambda clerk_id: None)
    res = client.post("/account/delete", headers=_headers("user_gone"))
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["already_deleted"] is True


def test_external_failure_aborts_before_db_delete(monkeypatch: pytest.MonkeyPatch):
    row = {
        "id": "aaaaaaaa-0000-0000-0000-000000000001",
        "stripe_customer_id": "cus_123",
        "stripe_subscription_id": "sub_123",
        "composio_account_id": None,
    }
    monkeypatch.setattr(deletion, "_fetch_deletion_row", lambda clerk_id: row)

    def _boom(sub_id):
        raise StripeError("stripe is down")

    monkeypatch.setattr(deletion, "_cancel_stripe_subscription", _boom)
    # Remaining external steps succeed, so the failure is isolated to one step.
    monkeypatch.setattr(deletion, "_delete_stripe_customer", lambda cid: deletion.DELETED)
    monkeypatch.setattr(deletion, "_purge_bucket_prefix", lambda b, p: deletion.SKIPPED)

    db_calls: list[str] = []
    monkeypatch.setattr(
        deletion, "_delete_users_row", lambda cid: db_calls.append(cid) or deletion.DELETED
    )

    res = client.post("/account/delete", headers=_headers("user_a"))

    assert res.status_code == 502
    detail = res.json()["detail"]
    assert detail["error"] == "account_deletion_incomplete"
    assert detail["steps"]["stripe_subscription"] == deletion.FAILED
    assert detail["steps"]["stripe_customer"] == deletion.DELETED
    assert detail["steps"]["database"] == deletion.SKIPPED
    # The users row (and the ids a retry needs) must survive the failure.
    assert db_calls == []


def test_composio_disconnect_failure_is_non_blocking(monkeypatch: pytest.MonkeyPatch):
    """Composio remote revoke is best-effort — a 500 must not block deletion."""
    row = {
        "id": "aaaaaaaa-0000-0000-0000-000000000001",
        "email": "user@example.com",
        "name": "Test User",
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "composio_account_id": "ca_9-IsYM1EdGGk",
    }
    monkeypatch.setattr(deletion, "_fetch_deletion_row", lambda clerk_id: row)
    monkeypatch.setattr(deletion.composio_mail, "is_configured", lambda: True)

    def _composio_500(_account_id: str) -> None:
        raise RuntimeError(
            "Error code: 500 - Failed to delete connected account by id"
        )

    monkeypatch.setattr(deletion.composio_mail, "disconnect", _composio_500)
    monkeypatch.setattr(deletion, "_purge_bucket_prefix", lambda b, p: deletion.SKIPPED)

    db_calls: list[str] = []
    monkeypatch.setattr(
        deletion, "_delete_users_row", lambda cid: db_calls.append(cid) or deletion.DELETED
    )

    res = client.post("/account/delete", headers=_headers("user_a"))

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["steps"]["composio_mail"] == deletion.SKIPPED
    assert body["steps"]["database"] == deletion.DELETED
    assert db_calls == ["user_a"]


def test_full_success_reports_every_step(monkeypatch: pytest.MonkeyPatch):
    row = {
        "id": "aaaaaaaa-0000-0000-0000-000000000001",
        "stripe_customer_id": "cus_123",
        "stripe_subscription_id": None,
        "composio_account_id": "conn_123",
    }
    monkeypatch.setattr(deletion, "_fetch_deletion_row", lambda clerk_id: row)
    monkeypatch.setattr(deletion, "_delete_stripe_customer", lambda cid: deletion.DELETED)
    monkeypatch.setattr(deletion, "_disconnect_composio", lambda aid: deletion.DELETED)
    monkeypatch.setattr(deletion, "_purge_bucket_prefix", lambda b, p: deletion.DELETED)
    monkeypatch.setattr(deletion, "_delete_users_row", lambda cid: deletion.DELETED)

    res = client.post("/account/delete", headers=_headers("user_a"))

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["already_deleted"] is False
    assert body["steps"]["stripe_subscription"] == deletion.SKIPPED  # no sub on the row
    assert body["steps"]["database"] == deletion.DELETED
