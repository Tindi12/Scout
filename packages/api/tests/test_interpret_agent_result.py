"""Unit tests for _interpret_agent_result classification precedence."""
from __future__ import annotations

from types import SimpleNamespace

from services.browser_agent import _interpret_agent_result, _verdict_from_agent_history


class _FakeResult:
    def __init__(
        self,
        *,
        success,
        final: str,
        errors: list[str] | None = None,
        history=None,
    ):
        self._success = success
        self._final = final
        self._errors = errors or []
        self.history = history or []

    def is_successful(self):
        return self._success

    def final_result(self):
        return self._final

    def has_errors(self):
        return bool(self._errors)


def test_spam_requires_phrase_not_substring():
    result = _FakeResult(
        success=False,
        final="Wrote a cover letter designed to prevent spam filters in ATS parsers.",
    )
    out = _interpret_agent_result(result)
    assert out.get("error_code") != "spam_blocked"


def test_verdict_spam_overrides_ambiguous_done():
    result = _FakeResult(success=None, final="I clicked submit.")
    out = _interpret_agent_result(
        result,
        post_submit_verdict={
            "classification": "spam_blocked",
            "confidence": "high",
            "evidence": ["possible spam"],
            "urlChanged": False,
        },
    )
    assert out["error_code"] == "spam_blocked"
    assert out["needs_attention"] is True
    assert "manually" in out["attention_question"].lower()


def test_verdict_still_on_form_blocks_loose_submitted_word():
    result = _FakeResult(success=None, final="Application submitted, waiting.")
    out = _interpret_agent_result(
        result,
        post_submit_verdict={
            "classification": "still_on_form",
            "confidence": "medium",
            "evidence": ["submit control still present"],
            "urlChanged": False,
        },
    )
    assert out["success"] is False
    assert out["error_code"] == "submission_unconfirmed"


def test_resume_upload_failed_needs_attention():
    result = _FakeResult(
        success=False,
        final="resume upload failed after retry",
    )
    out = _interpret_agent_result(result)
    assert out["error_code"] == "resume_upload_failed"
    assert out["needs_attention"] is True


def test_cancelled_terminal():
    result = _FakeResult(success=False, final="Application was cancelled by the user")
    out = _interpret_agent_result(result)
    assert out["error_code"] == "cancelled_by_user"
    assert out["needs_attention"] is False


def test_verdict_from_history_classification():
    result = _FakeResult(
        success=None,
        final="done",
        history=[
            SimpleNamespace(
                result="post_submit_check classification=spam_blocked confidence=high"
            )
        ],
    )
    verdict = _verdict_from_agent_history(result)
    assert verdict is not None
    assert verdict["classification"] == "spam_blocked"
