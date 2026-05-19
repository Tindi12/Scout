"""Turn provider exceptions into short, user-facing messages."""

from __future__ import annotations

import re
from typing import Optional


def _extract_retry_seconds(text: str) -> Optional[int]:
    match = re.search(r"retry in (\d+(?:\.\d+)?)\s*s", text, re.IGNORECASE)
    if not match:
        match = re.search(r"retryDelay['\"]?\s*:\s*['\"]?(\d+)", text, re.IGNORECASE)
    if not match:
        return None
    try:
        return max(1, int(float(match.group(1))))
    except ValueError:
        return None


def _extract_tpm_limits(text: str) -> tuple[Optional[int], Optional[int]]:
    requested = re.search(r"Requested\s+([\d,]+)", text, re.IGNORECASE)
    limit = re.search(r"Limit\s+([\d,]+)", text, re.IGNORECASE)
    if not requested or not limit:
        return None, None
    try:
        return (
            int(requested.group(1).replace(",", "")),
            int(limit.group(1).replace(",", "")),
        )
    except ValueError:
        return None, None


def _clip(text: str, max_len: int = 140) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 3] + "..."


def summarize_provider_error(provider: str, exc: Exception) -> str:
    text = str(exc)
    lower = text.lower()

    if provider == "Gemini" or provider.startswith("Gemini ("):
        return _summarize_gemini_failure_text(provider, text, lower)

    if provider == "Groq" or provider.startswith("Groq ("):
        return _summarize_groq_failure_text(provider, text, lower)

    if provider == "OpenAI":
        if "429" in text or "rate_limit" in lower:
            retry = _extract_retry_seconds(text)
            if retry:
                return f"OpenAI rate limit — retry in about {retry}s."
            return "OpenAI rate limit exceeded."
        if "insufficient_quota" in lower or "quota" in lower:
            return "OpenAI billing quota exceeded."
        return f"OpenAI error: {_clip(text)}"

    return f"{provider} error: {_clip(text)}"


def _summarize_gemini_failure_text(provider: str, text: str, lower: str) -> str:
    prefix = provider if provider.startswith("Gemini") else "Gemini"
    if "404" in text or "not found" in lower or "not supported" in lower:
        return f"{prefix}: model unavailable."
    if "429" in text or "resource_exhausted" in lower or "quota" in lower:
        retry = _extract_retry_seconds(text)
        if "limit: 0" in lower or "free_tier" in lower:
            return f"{prefix}: free-tier quota exhausted."
        if retry:
            return f"{prefix}: rate limit — retry in about {retry}s."
        return f"{prefix}: rate limit or daily quota exceeded."
    if "token" in lower and ("limit" in lower or "too large" in lower):
        return f"{prefix}: input too large for this model."
    if "empty" in lower:
        return f"{prefix}: empty response."
    return f"{prefix}: {_clip(text)}"


def summarize_gemini_model_error(model_label: str, exc: Exception) -> str:
    return _summarize_gemini_failure_text(
        f"Gemini ({model_label})", str(exc), str(exc).lower()
    )


def summarize_chain_failures(
    provider: str,
    model_issues: list[str],
    *,
    too_large_hint: str = "",
) -> str:
    if not model_issues:
        return f"{provider}: all models failed."
    if len(model_issues) == 1:
        return model_issues[0]

    too_large = [m for m in model_issues if "too large" in m.lower()]
    rate_limited = [
        m for m in model_issues if "rate limit" in m.lower() or "quota" in m.lower()
    ]

    if len(too_large) == len(model_issues) and too_large_hint:
        return (
            f"{provider}: request too large for all {len(model_issues)} models tried "
            f"({too_large_hint}). Shorten the resume and try again."
        )
    if len(rate_limited) == len(model_issues):
        return (
            f"{provider}: rate limited on all {len(model_issues)} models — "
            "wait a minute and try again."
        )

    preview = "; ".join(model_issues[:2])
    extra = len(model_issues) - 2
    if extra > 0:
        preview += f"; +{extra} more"
    return f"{provider}: tried {len(model_issues)} models — {preview}"


def _summarize_groq_failure_text(provider: str, text: str, lower: str) -> str:
    prefix = provider if provider.startswith("Groq") else "Groq"
    if (
        "rate_limit" in lower
        or "429" in text
        or "413" in text
        or "too large" in lower
    ):
        requested, limit = _extract_tpm_limits(text)
        if requested and limit:
            return (
                f"{prefix}: request too large (~{requested:,} tokens; "
                f"TPM limit {limit:,})."
            )
        if "tpm" in lower or "too large" in lower or "413" in text:
            return f"{prefix}: request too large for this model's TPM limit."
        return f"{prefix}: rate limited — try again shortly."
    if "empty" in lower:
        return f"{prefix}: empty response."
    return f"{prefix}: {_clip(text)}"


def summarize_groq_model_error(model_label: str, exc: Exception) -> str:
    return _summarize_groq_failure_text(f"Groq ({model_label})", str(exc), str(exc).lower())


def build_routing_failure_detail(issues: list[str]) -> str:
    if not issues:
        return (
            "AI services are temporarily unavailable. Please try again in a few minutes."
        )

    lines = ["AI request failed on all providers:"]
    for issue in issues:
        lines.append(f"• {issue}")

    if any("too large" in i.lower() for i in issues):
        lines.append("Tip: try a shorter resume (1–2 pages) or a cleaner PDF export.")
    elif any(
        "rate limit" in i.lower() or "quota" in i.lower() for i in issues
    ):
        lines.append("Tip: wait a minute and try again.")

    return "\n".join(lines)


def http_status_for_routing_issues(issues: list[str]) -> int:
    joined = " ".join(issues).lower()
    if "too large" in joined:
        return 413
    if "rate limit" in joined or "quota" in joined:
        return 503
    return 500
