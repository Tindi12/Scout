"""Encode / decode machine failure reasons inside applications.error_message.

No schema migration: we prefix the stored text with a stable marker and strip it
before anything user-facing. Retry / analytics read the derived failure_code.
"""
from __future__ import annotations

import re

# Codes that must not re-enter the automatic apply flow. Re-submitting a spam
# flag reinforces the ATS verdict; CAPTCHA usually needs a human browser.
NON_RETRYABLE_FAILURE_CODES = frozenset({"spam_blocked", "captcha_detected"})

_MARKER_RE = re.compile(
    r"^\[\[failure_code:([a-z0-9_]+)\]\](.*)$",
    re.DOTALL,
)


def encode_failure_message(message: str | None, error_code: str | None) -> str:
    text = (message or "").strip() or "Needs user attention"
    code = (error_code or "").strip().lower()
    if not code:
        return text
    # Avoid double-encoding if a caller already passed a marked string.
    existing, body = decode_failure_message(text)
    if existing:
        return encode_failure_message(body, code)
    return f"[[failure_code:{code}]]{text}"


def decode_failure_message(raw: str | None) -> tuple[str | None, str]:
    text = raw or ""
    match = _MARKER_RE.match(text)
    if not match:
        return None, text
    return match.group(1), match.group(2)


def failure_code_of(raw: str | None) -> str | None:
    code, _ = decode_failure_message(raw)
    return code


def user_facing_error_message(raw: str | None) -> str | None:
    if raw is None:
        return None
    _, body = decode_failure_message(raw)
    return body


def is_retryable_failure_code(code: str | None) -> bool:
    if not code:
        return True
    return code not in NON_RETRYABLE_FAILURE_CODES
