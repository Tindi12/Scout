"""Plain-language explanations for failed Scout applications."""

import logging
import re

from core.ai_router import call_ai

logger = logging.getLogger(__name__)

_SYSTEM = """You write short failure explanations for Scout, an internship application agent
that automatically applies to jobs on behalf of college students using browser automation.

The student sees your text in the Scout app when an application fails. They did NOT apply
manually — Scout was filling out the employer's application form for them.

The raw log below is from Scout's automated run. It is NOT the employer rejecting the
candidate's resume or interview performance.

Rules:
- Write exactly 1-2 sentences in plain English, speaking directly to the student ("you", "Scout").
- Say what Scout was trying to do and what stopped the application from finishing.
- Do NOT blame the employer's internal systems, dev environment, or account tiers.
- Do NOT speculate about the company's tech stack or suggest the error is "on their end".
- Be specific to Scout: browser session issues, form steps Scout couldn't complete, resume
  PDF generation, verification walls, usage limits, or the student stopping the run.
- If retry might work, say so. If they need to fix something in Scout (resume, settings),
  say what. If it's a Scout platform limit, say that clearly.
- No markdown, bullet points, quotes, error codes, or mention of being an AI."""


def _is_cancelled(error_message: str) -> bool:
    value = (error_message or "").strip()
    return value == "cancelled_by_user" or value.startswith("cancelled_by_user")


def _static_summary(error_message: str) -> str | None:
    """Fast, deterministic copy for well-known failure modes — no AI needed."""
    lower = error_message.lower()
    if "pdflatex" in lower or "resume pdf" in lower:
        return (
            "Scout couldn't generate your tailored resume PDF before applying. "
            "Check that your resume is uploaded and try again."
        )
    if "service limit" in lower or "browserbase" in lower:
        return (
            "Scout hit a browser automation limit on our side, so this application "
            "couldn't finish. Try again later or contact support if it keeps happening."
        )
    if "browser_session" in lower:
        return (
            "Scout lost its browser session while filling out the application. "
            "This is usually temporary — try running Scout again."
        )
    if "verification" in lower or "captcha" in lower or "awaiting_code" in lower:
        return (
            "The employer's site asked for email verification and Scout paused waiting "
            "for a code. Enter the code when prompted, or apply manually if it expired."
        )
    if re.search(r"\b429\b|rate.?limit", lower):
        return (
            "Scout was rate-limited while applying. Wait a few minutes and try again."
        )
    return None


async def explain_application_failure(
    *,
    company: str,
    role: str,
    error_message: str,
) -> dict[str, str]:
    technical = (error_message or "").strip()
    if not technical:
        return {
            "kind": "failed",
            "summary": "Scout couldn't finish this application.",
            "technical": "",
        }

    if _is_cancelled(technical):
        return {
            "kind": "cancelled",
            "summary": "You stopped this application before Scout could finish.",
            "technical": technical,
        }

    static = _static_summary(technical)
    if static:
        return {
            "kind": "failed",
            "summary": static,
            "technical": technical,
        }

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
        summary = (
            "Scout couldn't complete this application. Try again, or check your "
            "resume and Scout settings if it keeps failing."
        )

    return {
        "kind": "failed",
        "summary": summary.strip(),
        "technical": technical,
    }
