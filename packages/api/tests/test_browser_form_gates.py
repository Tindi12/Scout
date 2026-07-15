"""Unit tests for required-field inventory and post-submit classification."""
from __future__ import annotations

from services.browser_form_gates import (
    classify_post_submit_payload,
    evaluate_required_inventory,
    final_text_looks_confirmed,
    final_text_looks_like_spam,
    hash_inventory,
    required_field_blocker_message,
    timezone_geo_mismatch,
)


def test_scan_marks_native_required_empty():
    report = {
        "fields": [
            {
                "key": "main:text:name",
                "kind": "text",
                "label": "Name*",
                "requiredReason": "native_required",
                "satisfied": False,
                "valuePresent": False,
                "valueFingerprint": None,
                "groupKey": None,
                "domHint": "name",
            }
        ],
        "summary": {"totalRequired": 1, "satisfied": 0, "unsatisfied": 1},
    }
    issues = evaluate_required_inventory(report, None)
    assert len(issues) == 1
    assert "Name" in required_field_blocker_message(issues)


def test_scan_radio_group_requires_one_checked():
    report = {
        "fields": [
            {
                "key": "main:radio:workauth",
                "kind": "radio_group",
                "label": "Authorized to work?",
                "requiredReason": "fieldset_required",
                "satisfied": False,
                "valuePresent": False,
                "valueFingerprint": None,
                "groupKey": "workauth",
                "domHint": "workauth",
            }
        ],
        "summary": {"totalRequired": 1, "satisfied": 0, "unsatisfied": 1},
    }
    assert len(evaluate_required_inventory(report)) == 1


def test_scan_file_merges_upload_state_accepted():
    report = {
        "fields": [
            {
                "key": "main:file:resume",
                "kind": "file",
                "label": "Resume*",
                "requiredReason": "file_required",
                "satisfied": False,
                "valuePresent": False,
                "valueFingerprint": None,
                "groupKey": None,
                "domHint": "resume",
            }
        ],
        "summary": {"totalRequired": 1, "satisfied": 0, "unsatisfied": 1},
    }
    upload_state = {"fields": {"main:resume": {"status": "accepted"}}}
    assert evaluate_required_inventory(report, upload_state) == []


def test_combobox_placeholder_not_satisfied():
    report = {
        "fields": [
            {
                "key": "main:combobox:loc",
                "kind": "combobox",
                "label": "Current Location*",
                "requiredReason": "aria_required",
                "satisfied": True,
                "valuePresent": True,
                "valueFingerprint": "select",
                "groupKey": None,
                "domHint": "location",
            }
        ],
        "summary": {"totalRequired": 1, "satisfied": 1, "unsatisfied": 0},
    }
    issues = evaluate_required_inventory(report)
    assert len(issues) == 1


def test_fixed_point_hash_stable():
    report = {
        "fields": [
            {
                "key": "a",
                "satisfied": True,
                "valueFingerprint": "abc",
            },
            {
                "key": "b",
                "satisfied": False,
                "valueFingerprint": None,
            },
        ]
    }
    assert hash_inventory(report) == hash_inventory(report)
    other = {
        "fields": [
            {"key": "b", "satisfied": False, "valueFingerprint": None},
            {"key": "a", "satisfied": True, "valueFingerprint": "abc"},
        ]
    }
    assert hash_inventory(report) == hash_inventory(other)


def test_classify_spam_ashby_banner():
    verdict = classify_post_submit_payload(
        {
            "classification": "spam_blocked",
            "confidence": "high",
            "evidence": ["flagged as possible spam"],
            "urlChanged": False,
        }
    )
    assert verdict["classification"] == "spam_blocked"
    assert verdict["confidence"] == "high"


def test_classify_confirmed_thank_you():
    verdict = classify_post_submit_payload(
        {
            "classification": "confirmed",
            "confidence": "high",
            "evidence": ["Thank you for applying"],
            "urlChanged": True,
        }
    )
    assert verdict["classification"] == "confirmed"


def test_spam_requires_phrase_not_substring():
    assert final_text_looks_like_spam("designed to prevent spam filters") is False
    assert final_text_looks_like_spam("flagged as possible spam") is True


def test_confirm_phrases():
    assert final_text_looks_confirmed("Thank you for applying!") is True
    assert final_text_looks_confirmed("I submitted the form") is False


def test_timezone_geo_mismatch_indiana():
    warning = timezone_geo_mismatch(
        geo_state="IN", timezone_id="America/Chicago"
    )
    assert warning is not None
    assert "IN" in warning
    assert timezone_geo_mismatch(geo_state="IN", timezone_id="America/Indiana/Indianapolis") is None
