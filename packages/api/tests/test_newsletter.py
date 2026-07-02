"""Newsletter signup safety properties (core/newsletter.py).

Resend's contact model: contacts are global (no audience id at creation); a "segment"
is what used to be called an audience, and membership is a separate association.

What must hold, per the design contract:
1. subscribe() NEVER raises — a Resend outage returns "failed", the caller (the
   landing-page form) proceeds without crashing.
2. Unset RESEND_API_KEY / RESEND_SEGMENT_ID is a silent no-op (safe for local dev).
3. A contact already in the segment is reported as "already_subscribed" and gets no
   confirmation email (no double-send to someone already on the list).
4. A brand-new email gets a global contact created, added to the segment, AND gets
   exactly one confirmation email.
5. An email that is already a global Resend contact (for some other reason) but not yet
   in this segment skips contact creation, joins the segment, and IS confirmed (first
   time joining THIS list).
6. A lookup, create, or segment-add failure never sends a confirmation email.
7. remove_contact() (account deletion) deletes the global contact; "not found" is the
   caller's job to treat as a no-op, per services/account_deletion.py.
"""
import os

os.environ["SENTRY_DSN"] = ""  # error paths are exercised on purpose — keep Sentry off

import pytest  # noqa: E402
from resend.exceptions import ResendError  # noqa: E402

import core.newsletter as newsletter_mod  # noqa: E402


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("RESEND_SEGMENT_ID", "seg_test_123")


def _not_found():
    raise ResendError(code=404, error_type="not_found", message="Contact not found", suggested_action="")


def test_not_configured_is_silent_noop(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("RESEND_SEGMENT_ID", raising=False)
    assert newsletter_mod.subscribe("user@example.com") == "not_configured"


def test_already_in_segment_is_not_re_sent(configured, monkeypatch):
    import resend

    monkeypatch.setattr(
        resend.Contacts.Segments,
        "list",
        lambda params: {"object": "list", "data": [{"id": "seg_test_123", "name": "News"}], "has_more": False},
    )
    created = []
    added = []
    sent = []
    monkeypatch.setattr(resend.Contacts, "create", lambda params: created.append(params))
    monkeypatch.setattr(resend.Contacts.Segments, "add", lambda params: added.append(params))
    monkeypatch.setattr(newsletter_mod, "send_email", lambda **kw: sent.append(kw))

    result = newsletter_mod.subscribe("existing@example.com")

    assert result == "already_subscribed"
    assert created == []
    assert added == []
    assert sent == []


def test_brand_new_email_is_created_added_and_confirmed_once(configured, monkeypatch):
    import resend

    monkeypatch.setattr(resend.Contacts.Segments, "list", lambda params: _not_found())
    created = []
    added = []
    sent = []
    monkeypatch.setattr(
        resend.Contacts, "create", lambda params: created.append(params) or {"id": "c1"}
    )
    monkeypatch.setattr(
        resend.Contacts.Segments, "add", lambda params: added.append(params) or {"id": "assoc1"}
    )
    monkeypatch.setattr(newsletter_mod, "send_email", lambda **kw: sent.append(kw))

    result = newsletter_mod.subscribe("new@example.com")

    assert result == "subscribed"
    assert len(created) == 1
    assert created[0] == {"email": "new@example.com"}
    assert len(added) == 1
    assert added[0] == {"segment_id": "seg_test_123", "email": "new@example.com"}
    assert len(sent) == 1
    assert sent[0]["email_type"] == newsletter_mod.EMAIL_NEWSLETTER_CONFIRM


def test_existing_global_contact_not_in_segment_skips_create_but_is_confirmed(
    configured, monkeypatch
):
    import resend

    # Contact exists globally (list succeeds) but has no segments yet.
    monkeypatch.setattr(
        resend.Contacts.Segments,
        "list",
        lambda params: {"object": "list", "data": [], "has_more": False},
    )
    created = []
    added = []
    sent = []
    monkeypatch.setattr(resend.Contacts, "create", lambda params: created.append(params))
    monkeypatch.setattr(resend.Contacts.Segments, "add", lambda params: added.append(params))
    monkeypatch.setattr(newsletter_mod, "send_email", lambda **kw: sent.append(kw))

    result = newsletter_mod.subscribe("already-a-contact@example.com")

    assert result == "subscribed"
    assert created == []  # already a global contact — no create call
    assert len(added) == 1
    assert len(sent) == 1


def test_lookup_failure_never_raises_and_never_sends(configured, monkeypatch):
    import resend

    def _boom(params):
        raise RuntimeError("resend is down")

    sent = []
    monkeypatch.setattr(resend.Contacts.Segments, "list", _boom)
    monkeypatch.setattr(newsletter_mod, "send_email", lambda **kw: sent.append(kw))

    assert newsletter_mod.subscribe("user@example.com") == "failed"
    assert sent == []


def test_create_failure_never_raises_and_never_sends(configured, monkeypatch):
    import resend

    monkeypatch.setattr(resend.Contacts.Segments, "list", lambda params: _not_found())

    def _boom(params):
        raise RuntimeError("resend is down")

    sent = []
    monkeypatch.setattr(resend.Contacts, "create", _boom)
    monkeypatch.setattr(newsletter_mod, "send_email", lambda **kw: sent.append(kw))

    assert newsletter_mod.subscribe("user@example.com") == "failed"
    assert sent == []


def test_segment_add_failure_never_raises_and_never_sends(configured, monkeypatch):
    import resend

    monkeypatch.setattr(resend.Contacts.Segments, "list", lambda params: _not_found())
    monkeypatch.setattr(resend.Contacts, "create", lambda params: {"id": "c1"})

    def _boom(params):
        raise RuntimeError("resend is down")

    sent = []
    monkeypatch.setattr(resend.Contacts.Segments, "add", _boom)
    monkeypatch.setattr(newsletter_mod, "send_email", lambda **kw: sent.append(kw))

    assert newsletter_mod.subscribe("user@example.com") == "failed"
    assert sent == []


def test_remove_contact_is_noop_without_api_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    import resend

    called = []
    monkeypatch.setattr(resend.Contacts, "remove", lambda **kw: called.append(kw))
    newsletter_mod.remove_contact("user@example.com")  # must not raise
    assert called == []


def test_remove_contact_calls_resend_when_configured(configured, monkeypatch):
    import resend

    called = []
    monkeypatch.setattr(resend.Contacts, "remove", lambda **kw: called.append(kw))
    newsletter_mod.remove_contact("user@example.com")
    assert called == [{"email": "user@example.com"}]


def test_remove_contact_propagates_failure(configured, monkeypatch):
    import resend

    def _boom(**_kw):
        raise RuntimeError("resend is down")

    monkeypatch.setattr(resend.Contacts, "remove", _boom)
    with pytest.raises(RuntimeError):
        newsletter_mod.remove_contact("user@example.com")
