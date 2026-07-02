"""Transactional-email safety properties (core/email.py + its three hooks).

What must hold, per the design contract:
1. send_email NEVER raises — a Resend outage returns False, the caller proceeds.
2. Unset RESEND_API_KEY is a silent no-op (local dev).
3. Token substitution works against the real committed artifacts, and the HTML body
   escapes the name (no markup injection through a display name).
4. claim_email_send gates duplicates: only a winning claim sends (Stripe/Svix
   redelivery safety).
5. The farewell email cannot stop account deletion, and it fires only on the run
   that actually deletes the row (not on aborted runs).
"""
import os

os.environ.setdefault("SCOUT_INTERNAL_API_SECRET", "test-internal-secret")
os.environ["SENTRY_DSN"] = ""  # error paths are exercised on purpose — keep Sentry off

import pytest  # noqa: E402
import resend  # noqa: E402

import core.email as email_mod  # noqa: E402
import routes.stripe_router as stripe_router  # noqa: E402
import services.account_deletion as deletion  # noqa: E402


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")


def test_send_never_raises_on_provider_failure(configured, monkeypatch):
    def _boom(params):
        raise RuntimeError("resend is down")

    monkeypatch.setattr(resend.Emails, "send", _boom)
    ok = email_mod.send_email(
        to="user@example.com", email_type=email_mod.EMAIL_WELCOME, user_id="u1"
    )
    assert ok is False  # and, critically, no exception escaped


def test_unset_key_is_silent_noop(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    sent = []
    monkeypatch.setattr(resend.Emails, "send", lambda params: sent.append(params))
    ok = email_mod.send_email(
        to="user@example.com", email_type=email_mod.EMAIL_WELCOME, user_id="u1"
    )
    assert ok is False
    assert sent == []


def test_substitution_and_escaping_against_real_artifacts(configured, monkeypatch):
    captured = {}
    monkeypatch.setattr(resend.Emails, "send", lambda params: captured.update(params))

    ok = email_mod.send_email(
        to="user@example.com",
        email_type=email_mod.EMAIL_UPGRADE_PRO,
        first_name="<Alex> & Co",
        user_id="u1",
    )

    assert ok is True
    assert captured["from"] == email_mod.FROM_ADDRESS
    assert captured["reply_to"] == email_mod.REPLY_TO
    assert captured["to"] == ["user@example.com"]
    # No token survives into either body.
    assert "{{" not in captured["html"] and "{{" not in captured["text"]
    # first_name_from keeps only the first token; the HTML body escapes it (no
    # markup injection via display name) while plain text keeps it raw.
    assert "&lt;Alex&gt;" in captured["html"]
    assert "Hey <Alex>," in captured["text"]
    assert "Scout Pro" in captured["text"]


def test_try_send_welcome_email_delegates_to_send(configured, monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(email_mod, "claim_email_send", lambda *_: True)
    monkeypatch.setattr(
        email_mod,
        "send_email",
        lambda **kw: sent.append(kw) or True,
    )
    assert email_mod.try_send_welcome_email(
        user_id="u1", to="user@example.com", first_name="Alex"
    )
    assert sent[0]["email_type"] == email_mod.EMAIL_WELCOME


def test_claim_gates_duplicate_sends(monkeypatch):
    class _FakeUpsert:
        def __init__(self, rows):
            self._rows = rows

        def execute(self):
            class R:
                data = self._rows

            return R()

    class _FakeTable:
        def __init__(self, rows):
            self._rows = rows

        def upsert(self, *_args, **_kwargs):
            return _FakeUpsert(self._rows)

    class _FakeSupabase:
        def __init__(self, rows):
            self._rows = rows

        def table(self, _name):
            return _FakeTable(self._rows)

    monkeypatch.setattr(email_mod, "supabase", _FakeSupabase([{"user_id": "u1"}]))
    assert email_mod.claim_email_send("u1", "welcome") is True

    monkeypatch.setattr(email_mod, "supabase", _FakeSupabase([]))  # duplicate
    assert email_mod.claim_email_send("u1", "welcome") is False


def test_upgrade_thanks_skips_when_already_claimed(monkeypatch):
    sent = []
    monkeypatch.setattr(stripe_router, "claim_email_send", lambda *_: False)
    monkeypatch.setattr(stripe_router, "send_email", lambda **kw: sent.append(kw))
    stripe_router._send_upgrade_thanks("u1", "pro")
    assert sent == []


def test_farewell_failure_does_not_stop_deletion(monkeypatch):
    row = {
        "id": "aaaaaaaa-0000-0000-0000-000000000001",
        "email": "user@example.com",
        "name": "Alex Doe",
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "composio_account_id": None,
    }
    monkeypatch.setattr(deletion, "_fetch_deletion_row", lambda clerk_id: row)
    monkeypatch.setattr(deletion, "_purge_bucket_prefix", lambda b, p: deletion.SKIPPED)
    monkeypatch.setattr(deletion, "_remove_newsletter_contact", lambda email: deletion.SKIPPED)

    db_calls: list[str] = []
    monkeypatch.setattr(
        deletion, "_delete_users_row", lambda cid: db_calls.append(cid) or deletion.DELETED
    )

    def _email_boom(**_kw):
        raise RuntimeError("smtp meltdown")

    monkeypatch.setattr(deletion, "send_email", _email_boom)

    result = deletion.delete_account_data("user_a")

    assert result["ok"] is True
    assert db_calls == ["user_a"]  # deletion completed despite the email failure


def test_farewell_not_sent_on_aborted_run(monkeypatch):
    from stripe import StripeError

    row = {
        "id": "aaaaaaaa-0000-0000-0000-000000000001",
        "email": "user@example.com",
        "name": "Alex Doe",
        "stripe_customer_id": "cus_1",
        "stripe_subscription_id": "sub_1",
        "composio_account_id": None,
    }
    monkeypatch.setattr(deletion, "_fetch_deletion_row", lambda clerk_id: row)
    monkeypatch.setattr(deletion, "_purge_bucket_prefix", lambda b, p: deletion.SKIPPED)
    monkeypatch.setattr(deletion, "_remove_newsletter_contact", lambda email: deletion.SKIPPED)
    monkeypatch.setattr(deletion, "_delete_stripe_customer", lambda cid: deletion.DELETED)

    def _stripe_boom(sub_id):
        raise StripeError("stripe is down")

    monkeypatch.setattr(deletion, "_cancel_stripe_subscription", _stripe_boom)

    sent = []
    monkeypatch.setattr(deletion, "send_email", lambda **kw: sent.append(kw))

    with pytest.raises(deletion.AccountDeletionError):
        deletion.delete_account_data("user_a")

    assert sent == []  # aborted runs must not tell the user their data was deleted
