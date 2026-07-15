"""Unit tests for Ashby session policy and failure-code encoding."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


def test_resolve_block_ads_ashby_defaults_off(monkeypatch):
    monkeypatch.delenv("SCOUT_ASHBY_BLOCK_ADS", raising=False)
    from services.browser_session_policy import resolve_block_ads

    assert resolve_block_ads(portal="ashby", job_url="https://jobs.ashbyhq.com/x") is False
    assert resolve_block_ads(
        portal=None, job_url="https://jobs.ashbyhq.com/uncountable/abc"
    ) is False


def test_resolve_block_ads_ashby_env_override(monkeypatch):
    monkeypatch.setenv("SCOUT_ASHBY_BLOCK_ADS", "true")
    from services.browser_session_policy import resolve_block_ads

    assert resolve_block_ads(portal="ashby", job_url="https://jobs.ashbyhq.com/x") is True


def test_resolve_block_ads_other_portals_on(monkeypatch):
    monkeypatch.delenv("SCOUT_ASHBY_BLOCK_ADS", raising=False)
    from services.browser_session_policy import resolve_block_ads

    assert resolve_block_ads(
        portal="greenhouse", job_url="https://boards.greenhouse.io/x"
    ) is True
    assert resolve_block_ads(portal="lever", job_url="https://jobs.lever.co/x") is True


def test_create_session_respects_block_ads(monkeypatch):
    monkeypatch.setenv("BROWSERBASE_PROXIES", "false")
    client = MagicMock()
    session = MagicMock(id="sess-test", connect_url="wss://redacted")
    client.sessions.create.return_value = session

    with patch("core.browserbase.get_client", return_value=client):
        from core.browserbase import create_session

        create_session(
            geolocation={"city": "Rochester", "state": "IN", "country": "US"},
            block_ads=False,
        )
    kwargs = client.sessions.create.call_args.kwargs
    assert kwargs["browser_settings"]["block_ads"] is False
    assert kwargs["browser_settings"]["solve_captchas"] is True


def test_failure_code_roundtrip():
    from services.application_failure_codes import (
        decode_failure_message,
        encode_failure_message,
        failure_code_of,
        is_retryable_failure_code,
        user_facing_error_message,
    )

    raw = encode_failure_message(
        "The job site flagged this application as possible spam.",
        "spam_blocked",
    )
    assert raw.startswith("[[failure_code:spam_blocked]]")
    code, body = decode_failure_message(raw)
    assert code == "spam_blocked"
    assert "possible spam" in body
    assert failure_code_of(raw) == "spam_blocked"
    assert user_facing_error_message(raw) == body
    assert is_retryable_failure_code("spam_blocked") is False
    assert is_retryable_failure_code("captcha_detected") is False
    assert is_retryable_failure_code("resume_upload_failed") is True
    assert is_retryable_failure_code(None) is True


def test_encode_does_not_double_wrap():
    from services.application_failure_codes import encode_failure_message

    once = encode_failure_message("hello", "spam_blocked")
    twice = encode_failure_message(once, "spam_blocked")
    assert twice.count("[[failure_code:") == 1
