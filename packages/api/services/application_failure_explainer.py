"""User-facing explanations for failed Scout applications.

Everything returned from here is shown verbatim in the app, so it must read
from the STUDENT's perspective and never leak how Scout works internally (no
browsers, sessions, vendors, models, timeouts, error codes). The AI output is
run through a hard blocklist as a backstop — if any internal term slips
through, the user gets a calm generic summary instead.
"""

import logging
import re

from core.ai_router import call_ai

logger = logging.getLogger(__name__)

# Shown whenever we can't (or shouldn't) show a specific summary. Calm, no
# internals, points at the retry as the next step.
GENERIC_FAILURE_SUMMARY = (
    "We ran into an unexpected issue while submitting this application, so it "
    "couldn't be completed. Retrying usually resolves this."
)

CANCELLED_SUMMARY = "You stopped this application before Scout could finish."

_SYSTEM = """You write short, user-facing failure notes for Scout, an app that applies to
internships on behalf of college students. Scout was submitting this application for the
student and could not finish it.

The raw log below is internal. It is NOT the employer rejecting the student's resume or
candidacy — the application simply didn't get submitted.

Rules:
- Write 1-3 sentences in plain English, speaking directly to the student ("you", "Scout").
- Explain what happened from the student's perspective: the outcome, never the mechanics.
- NEVER mention or hint at how Scout works internally. Forbidden: browsers, browser
  automation, sessions, agents, AI, language models, APIs, servers, backends,
  infrastructure, timeouts, rate limits, quotas, error codes, logs, stack traces, and
  any tool or vendor name. Refer to everything as "the application" or "the employer's
  application process".
- Do NOT blame the employer's internal systems or speculate about their tech.
- Do NOT repeat any part of the log verbatim.
- End with the student's next step. Retrying is the primary recovery — if a retry could
  work, say so plainly. If something in Scout needs fixing first (like their resume),
  say exactly what.
- Tone: calm, reassuring, professional. No markdown, bullet points, quotes, or
  exclamation marks."""

# Backstop blocklist: if the AI summary contains ANY of these, it is discarded
# in favor of GENERIC_FAILURE_SUMMARY. Word-bounded so e.g. "rapid" never trips
# on "api".
_INTERNAL_TERMS = re.compile(
    r"(?i)\b("
    r"browserbase|playwright|selenium|chromium|chrome|headless|browsers?|"
    r"automation|automated|bots?|scripts?|"
    r"llms?|a\.i\.|ai|gpt|openai|gemini|groq|anthropic|claude|model|prompt|"
    r"apis?|endpoints?|servers?|backend|infrastructure|database|supabase|"
    r"redis|celery|python|sandbox|proxy|proxies|"
    r"timeouts?|timed\s+out|rate[-\s]?limit(?:ed|s)?|quotas?|"
    r"exceptions?|tracebacks?|stack\s?traces?|error\s?codes?|logs?|"
    r"sessions?|selectors?|dom|cdp|https?|json|tokens?|4\d\d|5\d\d|"
    # ATS / job-board vendor names — the application-process implementation detail
    # the student should never see (they just see "the employer's application").
    r"greenhouse|lever|ashby|workday|myworkday|icims|taleo|smartrecruiters|"
    r"jobvite|bamboohr|adzuna|jsearch|rapidapi|browser[-\s]?use|"
    # Scout's own stack / product names.
    r"clerk|vercel|railway|stripe|agentmail|resend|celery|"
    # Internal run-control concepts that describe HOW Scout drives the form.
    r"step\s?budget|step\s?limit|max\s?steps"
    r")\b"
)


def _is_cancelled(error_message: str) -> bool:
    value = (error_message or "").strip()
    return value == "cancelled_by_user" or value.startswith("cancelled_by_user")


def _static_summary(error_message: str) -> str | None:
    """Fast, deterministic copy for well-known failure modes — no AI needed."""
    lower = error_message.lower()
    if "pdflatex" in lower or "resume pdf" in lower:
        return (
            "We couldn't prepare your tailored resume for this application, so it "
            "wasn't submitted. Make sure your resume is uploaded in Scout, then retry."
        )
    if "missing_required_document" in lower:
        return (
            "This employer's application asks for a document Scout doesn't have on "
            "file for you yet. Add it to your profile and retry, or apply directly "
            "on the employer's site."
        )
    if "service limit" in lower or "browserbase" in lower:
        return (
            "Scout couldn't start this application due to high demand. Your credits "
            "weren't used — please retry in a little while."
        )
    if "browser_session" in lower:
        return (
            "This application was interrupted before Scout could finish submitting "
            "it. This is usually temporary — retrying often works."
        )
    if "planner_deadlock" in lower:
        return (
            "The employer's application flow changed unexpectedly before submission "
            "could be completed. Retrying gives Scout a fresh start and usually works."
        )
    if "verification" in lower or "captcha" in lower or "awaiting_code" in lower:
        return (
            "The employer's site required extra verification that couldn't be "
            "completed this time. You can retry, or apply directly on the "
            "employer's site."
        )
    if "spam" in lower or "spam_blocked" in lower:
        return (
            "The employer's site flagged this application as possible spam and "
            "refused it. Please apply directly on the employer's site — retrying "
            "with Scout is unlikely to help."
        )
    if re.search(r"\b429\b|rate.?limit", lower):
        return (
            "We ran into a temporary issue while submitting this application. "
            "Wait a few minutes and retry."
        )
    return None


def _sanitize(summary: str) -> str:
    """Last line of defense: never let internal terminology reach the user."""
    text = (summary or "").strip()
    if not text:
        return GENERIC_FAILURE_SUMMARY
    if _INTERNAL_TERMS.search(text):
        logger.warning(
            "failure summary blocked by internal-terms filter: %r", text[:200]
        )
        return GENERIC_FAILURE_SUMMARY
    # A well-formed summary is 1-3 sentences; anything sprawling is suspect.
    if len(text) > 420:
        return GENERIC_FAILURE_SUMMARY
    return text


def ensure_user_safe(summary: str) -> str:
    """Public guard for summaries produced/stored ELSEWHERE (precomputed notification
    bodies, older rows) before they are shown to a user. Runs the same blocklist +
    length cap as freshly-generated summaries, so a raw run log / verbose agent dump
    that ever lands in storage still can't reach the tracker — it collapses to the
    calm generic copy instead."""
    return _sanitize(summary)


async def explain_application_failure(
    *,
    company: str,
    role: str,
    error_message: str,
) -> dict[str, str]:
    """Return {"kind", "summary"} — user-facing only, no technical details."""
    technical = (error_message or "").strip()
    if not technical:
        return {"kind": "failed", "summary": GENERIC_FAILURE_SUMMARY}

    if _is_cancelled(technical):
        return {"kind": "cancelled", "summary": CANCELLED_SUMMARY}

    static = _static_summary(technical)
    if static:
        return {"kind": "failed", "summary": static}

    company_label = (company or "this company").strip() or "this company"
    role_label = (role or "this role").strip() or "this role"
    prompt = (
        f"Scout was applying to:\n"
        f"  Company: {company_label}\n"
        f"  Role: {role_label}\n\n"
        f"Scout run log (internal — interpret for the student, do not repeat verbatim):\n"
        f"{technical[:1200]}\n\n"
        "Write the student-facing explanation."
    )

    try:
        summary = await call_ai(prompt, _SYSTEM, task="quality")
    except Exception as exc:
        logger.warning("failure summary AI failed: %s", exc)
        summary = GENERIC_FAILURE_SUMMARY

    return {"kind": "failed", "summary": _sanitize(summary)}
