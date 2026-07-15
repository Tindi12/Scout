"""Broadcast helper safety properties (core/broadcast.py).

What must hold:
1. create_broadcast / announce_* NEVER raise.
2. Missing Resend config ⇒ not_configured (local-dev safe).
3. Default is draft (send=False) — never auto-send.
4. Explicit send=True creates-and-sends; scheduled_at marks scheduled.
5. Resend exceptions return failed without raising.
"""
import os

os.environ["SENTRY_DSN"] = ""

import pytest  # noqa: E402

import core.broadcast as broadcast_mod  # noqa: E402


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("RESEND_SEGMENT_ID", "seg_test_123")
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://scoutintern.com")


@pytest.fixture()
def templates(monkeypatch: pytest.MonkeyPatch):
    html = (
        "<html><body><h1>{{headline}}</h1><p>{{body}}</p>"
        '<a href="{{cta_url}}">{{cta_label}}</a>'
        "{{{RESEND_UNSUBSCRIBE_URL}}}</body></html>"
    )
    text = "{{headline}}\n\n{{body}}\n\n{{cta_label}}: {{cta_url}}\n"
    monkeypatch.setattr(
        broadcast_mod,
        "_load_announcement_template",
        lambda ext: html if ext == "html" else text,
    )


def test_not_configured_is_silent_noop(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("RESEND_SEGMENT_ID", raising=False)
    result = broadcast_mod.announce_blog_post(
        title="Hello", description="World", slug="hello"
    )
    assert result.status == "not_configured"
    assert result.broadcast_id is None


def test_default_creates_draft_not_send(configured, templates, monkeypatch):
    import resend

    created = []

    def _create(params):
        created.append(params)
        return {"id": "bcast_draft_1"}

    monkeypatch.setattr(resend.Broadcasts, "create", _create)

    result = broadcast_mod.announce_blog_post(
        title="Why I Built Scout",
        description="Founder story",
        slug="why-i-built-scout",
    )

    assert result.status == "draft_created"
    assert result.broadcast_id == "bcast_draft_1"
    assert len(created) == 1
    assert created[0]["send"] is False
    assert created[0]["segment_id"] == "seg_test_123"
    assert "Why I Built Scout" in created[0]["subject"]
    assert "scoutintern.com/blog/why-i-built-scout" in created[0]["html"]


def test_explicit_send_marks_sent(configured, templates, monkeypatch):
    import resend

    created = []

    def _create(params):
        created.append(params)
        return {"id": "bcast_sent_1"}

    monkeypatch.setattr(resend.Broadcasts, "create", _create)

    result = broadcast_mod.announce_changelog(
        title="Scout Beta Launch",
        description="Version 0.1 is live",
        version="0.1",
        send=True,
    )

    assert result.status == "sent"
    assert created[0]["send"] is True
    assert "scheduled_at" not in created[0]


def test_scheduled_send(configured, templates, monkeypatch):
    import resend

    created = []

    def _create(params):
        created.append(params)
        return {"id": "bcast_sched_1"}

    monkeypatch.setattr(resend.Broadcasts, "create", _create)

    result = broadcast_mod.announce_product(
        subject="Scout update",
        headline="We shipped something",
        body="Details inside.",
        send=True,
        scheduled_at="in 1 hour",
    )

    assert result.status == "scheduled"
    assert created[0]["send"] is True
    assert created[0]["scheduled_at"] == "in 1 hour"


def test_resend_failure_returns_failed(configured, templates, monkeypatch):
    import resend

    def _boom(_params):
        raise RuntimeError("resend down")

    monkeypatch.setattr(resend.Broadcasts, "create", _boom)

    result = broadcast_mod.create_broadcast(
        subject="x",
        headline="x",
        body="y",
        cta_label="Go",
        cta_url="https://scoutintern.com",
        send=False,
    )
    assert result.status == "failed"
    assert result.detail == "resend_error"


def test_missing_template_returns_failed(configured, monkeypatch):
    monkeypatch.setattr(broadcast_mod, "_load_announcement_template", lambda ext: None)
    result = broadcast_mod.announce_product(
        subject="x", headline="x", body="y"
    )
    assert result.status == "failed"
    assert result.detail == "announcement_template_missing"
