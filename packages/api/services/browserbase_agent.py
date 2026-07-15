"""
Scout's job-application engine on the **Browserbase Agents** platform.

Replaces the browser-use engine (services/browser_agent.py, deleted). Browserbase now
owns the browser loop, the model, and the session; Scout owns one reusable agent
TEMPLATE (system prompt + result schema) and fires one RUN per application.

Per apply:
  1. Upload the freshly generated resume (+ optional cover letter) PDF to a private
     Supabase bucket and mint short-TTL signed URLs (core/apply_storage.py).
  2. Start a run against the agent template, passing the signed URLs + application URL
     as `variables` and the candidate profile as the run `task`.
  3. Poll the run to a terminal state, honoring the Redis stop-all flag and a hard
     wall-clock deadline; map the typed result to Scout's apply-result contract.
  4. Delete the storage artifacts.

apply() returns the SAME dict contract the old engine did, so tasks/job_tasks.py is
unchanged apart from the call site:
  {success, error_code?, error?, needs_attention, attention_question?}
"""
from __future__ import annotations

import logging
import os
import re
import time
import uuid
from urllib.parse import urlparse

from dotenv import load_dotenv

from core.apply_storage import SIGNED_URL_TTL_SECONDS, delete_objects, upload_and_sign
from core.browserbase_agents import TERMINAL_STATUSES, get_client
from core.redis_client import (
    CONTROL_TOKEN_TTL,
    VERIFICATION_CODE_TTL,
    cancel_key,
    cancelled_token_key,
    gate_key,
    get_redis,
    verification_code_key,
)

from services.browser_session_policy import resolve_block_ads, resolve_portal

logger = logging.getLogger(__name__)
load_dotenv()

# Residential-proxy toggle (datacenter egress IP is a top ATS spam signal). The Agents
# API only accepts browserSettings.proxies as a boolean — not the geo-targeted array
# shape the old Sessions API used. When on, Browserbase picks the exit IP; off = no proxy.
BROWSERBASE_PROXIES = os.getenv("BROWSERBASE_PROXIES", "").strip().lower() in {
    "1", "true", "yes", "on",
}

# Pinned agent template id. Set BROWSERBASE_AGENT_ID in prod so every worker reuses the
# same agent instead of creating a fresh one on first apply. If unset, one is created
# lazily and cached in-process (fine for dev; the id is logged so it can be pinned).
_AGENT_ID_ENV = "BROWSERBASE_AGENT_ID"
_cached_agent_id: str | None = None

# Poll cadence for get_run. Also the interval at which the stop-all flag is checked, so
# Stop All aborts a live run within a few seconds.
_POLL_INTERVAL = float(os.getenv("BROWSERBASE_AGENT_POLL_INTERVAL", "4"))

# Public base URL of THIS FastAPI service (Railway), used to build the per-run
# /apply-control/{token} and /apply-code/{token} URLs the agent visits mid-run. When
# unset, those variables are passed empty and the prompt degrades gracefully (no
# pre-submit check, verification codes fall back to the manual path).
_PUBLIC_API_URL = os.getenv("SCOUT_PUBLIC_API_URL", "").strip().rstrip("/")

# How long the worker keeps polling the Redis mailbox for the code after the gate is
# hit, and the cadence between polls. Must match routes/apply_code.py's WAIT->TIMEOUT
# window (same env var) so the agent and the worker give up together.
_VERIFY_WINDOW = int(os.getenv("APPLY_VERIFY_TIMEOUT", "300"))
_FETCH_INTERVAL = 15.0

AGENT_NAME = "Scout Job Application Agent"

# The reusable system prompt. It encodes Scout's apply policy (fill → upload → submit,
# with the dropdown / autocomplete / self-ID / spam / verification-code rules ported
# from the old STAGE 1/2/3 prompt). Per-run values arrive as variables and in the task.
SYSTEM_PROMPT = """You fill out and submit online job application forms for a candidate, using a resume PDF and a structured profile.

INPUTS (variables):
- %applicationUrl% — the job application page to complete.
- %resumeUrl% — URL to the candidate's resume PDF.
- %coverLetterUrl% — URL to a cover letter PDF, or an empty string when there is none.
- %controlUrl% — a status URL to check right before submitting (may be empty).
- %codeUrl% — a URL that delivers emailed verification codes (may be empty).
The candidate's profile fields are given in the task message. Use ONLY those values and what you read from the resume. Never invent personal information.

STEP 1 — Get the files:
- Download the resume from %resumeUrl% into your sandbox (use shell `curl -L` if the in-browser download is awkward).
- If %coverLetterUrl% is a non-empty URL, download the cover letter too.

STEP 2 — Open %applicationUrl%. Dismiss cookie / region / consent modals that block the form.

STEP 3 — Fill the visible fields from the profile:
- Only fill fields the form actually shows. Skip any profile data with no matching field; do not hunt for fields that aren't there.
- Phone: for international phone inputs (country-code/flag shown outside the box), type the 10-digit national number exactly as given — do not add +1 or a leading 1.
- Radio buttons, checkboxes, and short dropdowns: click them; never type into a radio/checkbox.
- Searchable dropdowns / comboboxes (school, degree, country, long option lists): click, TYPE to filter, then click the matching option. If the exact text finds nothing, try name variants (toggle a leading "The", reorder words, or type the distinctive part) before giving up.
- Degree/education level: choose the candidate's ACTUAL degree from the profile — not the level implied by the role title (a "PhD Intern" posting does not mean pick PhD).
- Location autocomplete: type "City, State", wait for the suggestion list, then click the matching suggestion. Do not leave it as raw typed text — some fields clear on blur unless a suggestion is committed.
- Voluntary self-identification (gender, race/ethnicity, veteran, disability): use the profile's self-ID answers; for anything the profile does not cover, choose the "Decline to self-identify" option. Never guess a demographic answer.
- Do not loop on an optional field that won't retain its value — if it looks empty after one attempt and isn't required, skip it and move on.

STEP 4 — Upload the resume:
- Upload the downloaded resume PDF into the resume/CV file input. The input may be hidden — use the visible upload button or drag-and-drop area. Do not type the path; do not open an OS file-picker dialog.
- Verify the resume filename / an upload confirmation is visible before continuing.
- If %coverLetterUrl% was provided and the form has a cover-letter FILE-upload field, upload the cover letter there. A cover-letter TEXT box is a text answer, not an upload.

STEP 5 — Submit:
- Fill any remaining visible required fields and advance through every step of a multi-step flow.
- FINAL CHECK before clicking Submit: if %controlUrl% is a non-empty URL, open it in a NEW tab (never navigate the form tab away), read the short text it shows, close that tab, and return to the form. If it said CANCEL, the candidate cancelled this application: do NOT submit — set outcome to "blocked", blocker to "cancelled", and finish. If it said OK — or the page failed to load — proceed normally.
- Click the final Submit / Apply.
- If a "possible spam" banner appears, STOP — do not wait and do not click Submit again. Set blocker to "spam".
- If submission requires an emailed verification/security code, follow STEP 5a.
- If a CAPTCHA blocks you and cannot be cleared, set blocker to "captcha".
- If a required field cannot be answered from the profile or resume, set blocker to "missing_info".

STEP 5a — Emailed verification code (only when the site demands one to finish submitting):
- Scout retrieves the code from the candidate's email and delivers it at %codeUrl%. If %codeUrl% is an empty string you cannot obtain the code: set blocker to "verification_code" and finish.
- Open %codeUrl% in a NEW tab (keep the application form tab open exactly as it is). The page shows plain text:
  - WAIT — the code has not arrived yet. Wait about 15 seconds, refresh that tab, and read it again. Be patient and keep checking for up to 6 minutes; do NOT give up sooner and do NOT touch the form tab while waiting.
  - CANCEL — the candidate cancelled this application. Do not submit; set blocker to "cancelled" and finish.
  - TIMEOUT — the code could not be retrieved. Set blocker to "verification_code" and finish.
  - Anything else IS the verification code, exactly as displayed. Codes are CASE-SENSITIVE: return to the form tab and type it preserving upper/lower case EXACTLY as shown. If the form uses individual per-character boxes, click the first box and type the whole code. Set verificationCodeEntered to true, complete the submission, and continue to STEP 6.

STEP 6 — Confirm and report:
- Confirm the submission succeeded via a thank-you / application-received / confirmation screen, and capture that text in confirmationMessage.
- Set outcome to "submitted" and submitted to true ONLY with real confirmation evidence.
- If you clicked submit but saw no confirmation, set outcome to "unconfirmed" (do NOT resubmit — that risks a duplicate application).
- Set resumeUploaded and coverLetterUploaded to reflect what you actually attached.
- If blocked, set outcome to "blocked", submitted to false, the right blocker value, and explain in notes.
"""

# Typed result the agent must return — replaces free-text parsing of a "done" message.
RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "outcome": {
            "type": "string",
            "enum": ["submitted", "unconfirmed", "blocked", "failed"],
            "description": "submitted = confirmed submission; unconfirmed = clicked submit but no confirmation seen; blocked = could not submit; failed = could not complete.",
        },
        "submitted": {
            "type": "boolean",
            "description": "True only if the application was submitted with confirmation evidence.",
        },
        "resumeUploaded": {
            "type": "boolean",
            "description": "Whether the resume PDF was attached to the form.",
        },
        "coverLetterUploaded": {
            "type": "boolean",
            "description": "Whether a cover letter file was attached (false if none required/provided).",
        },
        "blocker": {
            "type": "string",
            "enum": [
                "none", "captcha", "spam", "verification_code", "missing_info",
                "cancelled", "other",
            ],
            "description": "Why submission could not complete, or 'none'. 'cancelled' = the control/code URL said CANCEL.",
        },
        "verificationCodeEntered": {
            "type": "boolean",
            "description": "True if an emailed verification code was retrieved from the code URL and entered.",
        },
        "confirmationMessage": {
            "type": "string",
            "description": "Success or error text shown after attempting submission.",
        },
        "notes": {
            "type": "string",
            "description": "Fields that could not be filled, upload issues, or other blockers.",
        },
    },
    "required": ["outcome", "submitted", "resumeUploaded", "blocker"],
}


# ── Pure profile → answer mapping helpers (ported from the old engine) ────────────────

_MONTH_NAMES = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

_DEGREE_LABELS = {
    "associate": "Associate's Degree",
    "bachelors": "Bachelor's Degree",
    "masters": "Master's Degree",
    "phd": "Doctorate / PhD",
}

_SELF_ID_DECLINE = "Decline to self identify / I don't wish to answer"
_GENDER_ANSWERS = {
    "man": "Male / Man", "woman": "Female / Woman", "non_binary": "Non-binary",
    "self_describe": "Prefer to self-describe", "prefer_not_to_say": _SELF_ID_DECLINE,
}
_RACE_ANSWERS = {
    "american_indian": "American Indian or Alaska Native", "asian": "Asian",
    "black": "Black or African American", "hispanic": "Hispanic or Latino",
    "pacific_islander": "Native Hawaiian or Other Pacific Islander", "white": "White",
    "two_or_more": "Two or more races", "prefer_not_to_say": _SELF_ID_DECLINE,
}
_VETERAN_ANSWERS = {
    "not_veteran": "I am not a protected veteran",
    "veteran": "I identify as one or more of the classes of protected veteran",
    "active_duty": "Active duty service member", "prefer_not_to_say": _SELF_ID_DECLINE,
}
_DISABILITY_ANSWERS = {
    "no": "No, I do not have a disability and have not had one in the past",
    "yes": "Yes, I have a disability, or have had one in the past",
    "prefer_not_to_say": _SELF_ID_DECLINE,
}


def resume_filename(applicant_name: str | None) -> str:
    """ATS-visible resume filename ("Rabuor Tindi" -> "Rabuor_Tindi_Resume.pdf"). A
    generic/random name is a spam tell, so we personalize it."""
    stem = re.sub(r"[^A-Za-z0-9]+", "_", applicant_name or "").strip("_")
    return f"{stem}_Resume.pdf" if stem else "Resume.pdf"


def cover_letter_filename(applicant_name: str | None) -> str:
    """ATS-visible cover-letter filename, personalized like resume_filename."""
    stem = re.sub(r"[^A-Za-z0-9]+", "_", applicant_name or "").strip("_")
    return f"{stem}_Cover_Letter.pdf" if stem else "Cover_Letter.pdf"


def _degree_label(degree_type: str | None) -> str:
    v = (degree_type or "").strip()
    if not v:
        return ""
    return _DEGREE_LABELS.get(v.lower(), v)


def _format_month_year(value: str | None) -> str:
    """Format a stored DATE ('2022-08-01') as 'August 2022'. Returns the raw value if
    unparseable; never raises."""
    v = (value or "").strip()
    if not v:
        return ""
    m = re.match(r"^(\d{4})-(\d{2})(?:-\d{2})?$", v)
    if not m:
        return v
    year = m.group(1)
    month_idx = int(m.group(2))
    if 1 <= month_idx <= 12:
        return f"{_MONTH_NAMES[month_idx - 1]} {year}"
    return v


def _national_phone(phone: str) -> str:
    """National significant number, digits only (10 for US; strips a leading +1/1)."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


def _self_identification_lines(user_data: dict) -> list[str]:
    """Voluntary self-ID answers from the profile, mapped to EEO-dropdown phrasing. Only
    filled fields are included; the prompt tells the agent to decline anything absent."""
    def answer(field: str, mapping: dict[str, str]) -> str | None:
        raw = (user_data.get(field) or "").strip()
        if not raw:
            return None
        return mapping.get(raw, raw.replace("_", " "))

    pairs = (
        ("Gender", answer("gender_identity", _GENDER_ANSWERS)),
        ("Race / Ethnicity", answer("race_ethnicity", _RACE_ANSWERS)),
        ("Veteran status", answer("veteran_status", _VETERAN_ANSWERS)),
        ("Disability status", answer("disability_status", _DISABILITY_ANSWERS)),
    )
    lines = [f"- {label}: {value}" for label, value in pairs if value]

    race = (user_data.get("race_ethnicity") or "").strip()
    if race and race != "prefer_not_to_say":
        lines.append(f"- Hispanic or Latino: {'Yes' if race == 'hispanic' else 'No'}")

    if lines:
        lines.insert(
            0,
            "Voluntary self-identification answers (match each to the closest option on the form):",
        )
    return lines


def _security_clearance_lines(user_data: dict) -> list[str]:
    """Security-clearance answers from the profile. Eligibility-critical: an unanswered
    profile section contributes only a safe "No active clearance" and stays silent on
    willingness (mirrors services/browser_agent.py)."""
    status = (user_data.get("security_clearance_status") or "").strip()
    levels = [
        str(level).strip()
        for level in (user_data.get("security_clearances") or [])
        if str(level).strip()
    ]
    held = ", ".join(levels)

    if status == "active":
        lines = [
            f"- Security clearance: ACTIVE — {held}" if held
            else "- Security clearance: ACTIVE (level not specified)",
            "- Do you hold an active security clearance: Yes"
            + (f" ({held})" if held else ""),
        ]
    elif status == "inactive":
        lines = [
            f"- Security clearance: previously held ({held}), currently inactive" if held
            else "- Security clearance: previously held, currently inactive",
            "- Do you hold an active security clearance: No"
            + (f" (previously held: {held})" if held else " (previously held one)"),
        ]
    else:
        lines = ["- Do you hold an active security clearance: No"]

    if status:
        willing = "Yes" if user_data.get("willing_to_obtain_clearance") or status == "active" else "No"
        lines.append(
            f"- Willing to obtain a security clearance / undergo a background investigation if required: {willing}"
        )
    return lines


def resolve_apply_company(*, job_url: str | None, job_company: str | None) -> str:
    """Employer display name for answer placeholders. Prefer jobs.company; fall back to
    a Greenhouse board slug in the URL."""
    company = (job_company or "").strip()
    if company:
        return company
    if not job_url:
        return "the company"
    parsed = urlparse(job_url)
    host = (parsed.netloc or "").lower()
    path_parts = [part for part in parsed.path.split("/") if part]
    if "greenhouse.io" in host and path_parts:
        slug = path_parts[0]
        if slug not in {"jobs", "embed"} and not slug.isdigit():
            return slug.replace("-", " ").title()
    if parsed.netloc:
        return parsed.netloc.split(".")[0].replace("-", " ").title()
    return "the company"


def _substitute_answer_placeholders(text: str, user_data: dict) -> str:
    """Replace {company} / {role} in canned answers before they reach the agent."""
    company = (user_data.get("company") or "the company").strip() or "the company"
    role = (
        user_data.get("job_title") or user_data.get("role") or "this role"
    ).strip() or "this role"
    return text.replace("{company}", company).replace("{role}", role)


# ── Run assembly + result interpretation ─────────────────────────────────────────────

def _needs_attention(error_code: str, error: str, question: str) -> dict:
    return {
        "success": False,
        "error_code": error_code,
        "error": error,
        "needs_attention": True,
        "attention_question": question,
    }


def _cause_message(cause) -> str:
    if isinstance(cause, dict):
        return cause.get("message") or cause.get("error") or str(cause)
    return str(cause) if cause else ""


def _interpret_run_result(status: str, result: dict | None, cause) -> dict:
    """Map a terminal Browserbase run to Scout's apply-result contract."""
    result = result or {}
    outcome = (result.get("outcome") or "").strip().lower()
    blocker = (result.get("blocker") or "none").strip().lower()
    notes = (result.get("notes") or "").strip()

    if status == "COMPLETED":
        if result.get("submitted") and outcome == "submitted":
            return {"success": True, "error": None, "needs_attention": False}
        # The agent aborted because our control/code URL said CANCEL (stop-all or an
        # abandoned deadline attempt). Terminal, never retried — mirrors the poll
        # loop's own cancelled_by_user return.
        if blocker == "cancelled":
            return {
                "success": False,
                "error_code": "cancelled_by_user",
                "error": "stopped before submitting",
                "needs_attention": False,
            }
        # Explicit blocks → needs_attention (never auto-retried by the task).
        if blocker == "spam":
            return _needs_attention(
                "spam_blocked",
                "The job site rejected the submission as possible spam",
                "The job site flagged this application as possible spam and refused it. "
                "Please submit it manually on the job page — retrying with Scout is "
                "unlikely to help and may reinforce the block.",
            )
        if blocker == "verification_code":
            return _needs_attention(
                "verification_code_timeout",
                "The job site required an emailed verification code",
                "This site emailed a verification code during submission and Scout "
                "couldn't retrieve it in time (no connected email, or the code never "
                "arrived). Please finish this application manually on the job page, or "
                "connect your email in Settings so Scout can handle codes next time.",
            )
        if blocker == "captcha":
            return _needs_attention(
                "captcha_detected",
                "CAPTCHA detected",
                "CAPTCHA verification was required — please apply manually.",
            )
        if outcome == "unconfirmed":
            return _needs_attention(
                "submission_unconfirmed",
                "Could not confirm the application was submitted",
                "Could not confirm this application was submitted. Please verify it on the "
                "job site (and only re-apply if it did not go through) to avoid a duplicate.",
            )
        if blocker == "missing_info":
            return {
                "success": False,
                "error_code": "missing_info",
                "error": notes or "The form required information not in the profile",
                "needs_attention": False,
            }
        # Completed but not submitted, no recognized blocker.
        return {
            "success": False,
            "error_code": "apply_incomplete",
            "error": notes or "The agent could not complete the application",
            "needs_attention": False,
        }

    if status == "TIMED_OUT":
        # Recoverable infra-ish stall — route into the task's session-loss retry ladder.
        return {
            "success": False,
            "error_code": "browser_session_lost",
            "error": "Browserbase agent run timed out",
            "needs_attention": False,
        }

    if status == "STOPPED":
        # A stop we didn't initiate (our own stop-all returns cancelled_by_user earlier).
        return {
            "success": False,
            "error_code": "run_stopped",
            "error": "The agent run was stopped before completing",
            "needs_attention": False,
        }

    # FAILED or anything unexpected.
    return {
        "success": False,
        "error_code": "browserbase_agent_failed",
        "error": _cause_message(cause) or "The agent run failed",
        "needs_attention": False,
    }


def _ensure_agent() -> str:
    """Resolve the reusable agent template id: pinned env var wins; else create once and
    cache in-process."""
    global _cached_agent_id
    env_id = os.getenv(_AGENT_ID_ENV, "").strip()
    if env_id:
        return env_id
    if _cached_agent_id:
        return _cached_agent_id
    created = get_client().create_agent(
        name=AGENT_NAME, system_prompt=SYSTEM_PROMPT, result_schema=RESULT_SCHEMA
    )
    agent_id = created.get("agentId") or created.get("id")
    if not agent_id:
        raise RuntimeError(f"create_agent returned no agent id: {created}")
    _cached_agent_id = agent_id
    logger.warning(
        "Created Browserbase agent %s — pin it as %s to reuse it across restarts.",
        agent_id, _AGENT_ID_ENV,
    )
    return agent_id


class BrowserbaseAgent:
    def _build_applicant_context(self, user_data: dict) -> str:
        name_parts = (user_data.get("name") or "").split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        answers = user_data.get("answers_library", {}) or {}
        answers_text = "\n".join(
            f"- {k.replace('_', ' ').title()}: {_substitute_answer_placeholders(str(v), user_data)}"
            for k, v in answers.items() if v
        )
        company = (user_data.get("company") or "the company").strip() or "the company"
        job_title = (user_data.get("job_title") or user_data.get("role") or "").strip()

        work_auth = user_data.get("work_authorization", "us_citizen")
        auth_map = {
            "us_citizen": "Yes, I am authorized to work in the US",
            "green_card": "Yes, I am authorized to work in the US",
            "f1_student": "No, I require sponsorship",
            "h1b": "No, I require sponsorship",
            "other_visa": "No, I require sponsorship",
        }
        auth_answer = auth_map.get(work_auth, "Yes")
        sponsorship = "Yes" if user_data.get("requires_sponsorship") else "No"

        city = user_data.get("address_city") or ""
        state = user_data.get("address_state") or ""
        street = user_data.get("address_street") or ""
        zipcode = user_data.get("address_zip") or ""
        address_lines = [
            line for line in (
                f"- Street address: {street}" if street else "",
                f"- City: {city}" if city else "",
                f"- State: {state}" if state else "",
                f"- Zip / Postal code: {zipcode}" if zipcode else "",
            ) if line
        ]

        phone_national = _national_phone(user_data.get("phone_number", ""))
        details = [
            f"- First name: {first_name}",
            f"- Last name: {last_name}",
            f"- Email: {user_data.get('email', '')}",
            f"- Phone (10-digit national number, no country code): {phone_national}",
        ]
        details.extend(address_lines)
        trailing = [
            f"- Country: {user_data.get('address_country') or 'United States'}",
            f"- LinkedIn: {user_data.get('linkedin_url', '')}",
            f"- GitHub: {user_data.get('github_url', '')}",
            f"- University/School: {user_data.get('school', '')}",
            f"- Degree (the applicant's actual degree level — use THIS for any degree field, "
            f"not the level implied by the job title): {_degree_label(user_data.get('degree_type'))}",
            f"- Major: {user_data.get('major', '')}",
            f"- GPA: {user_data.get('gpa', '')}",
        ]
        edu_start = _format_month_year(user_data.get("education_start_date"))
        edu_end = _format_month_year(user_data.get("education_end_date"))
        if edu_start:
            trailing.append(f"- Education start date: {edu_start}")
        if edu_end:
            trailing.append(f"- Expected graduation date: {edu_end}")
            year_match = re.search(r"\b(\d{4})\b", edu_end)
            if year_match:
                trailing.append(f"- Graduation year: {year_match.group(1)}")
        trailing.extend([
            f"- Work authorization question: {auth_answer}",
            f"- Requires visa sponsorship: {sponsorship}",
        ])
        trailing.extend(_security_clearance_lines(user_data))
        trailing.append(f"- Employer for this application: {company}")
        if job_title:
            trailing.append(f"- Role for this application: {job_title}")
        trailing.extend(_self_identification_lines(user_data))
        trailing.extend([
            "For an open-ended text question that matches one of these pre-written answers, "
            "use it (placeholders already resolved):",
            answers_text if answers_text else "(no pre-written answers on file)",
            "For open-ended questions NOT covered: write a CONCRETE answer that names at "
            "least one real project, employer, or technology from the resume you downloaded, "
            "and says what the candidate actually built or did (2-4 sentences). If the answer "
            "would still read fine with the project or company swapped out, it is too vague — "
            "rewrite it around the specifics. No boilerplate; never invent facts.",
        ])
        details.extend(trailing)
        return "\n".join(details)

    def _build_run_task(
        self, applicant_context: str, resume_name: str, cover_name: str | None
    ) -> str:
        lines = [
            "Complete and submit this job application for the candidate described below.",
            "The application URL is %applicationUrl%.",
            "The resume PDF to download and upload is at %resumeUrl%.",
        ]
        if cover_name:
            lines.append(
                "A cover letter PDF is at %coverLetterUrl% — upload it if the form has a "
                "cover-letter file field."
            )
            lines.append(f"When uploading, name the cover letter file '{cover_name}'.")
        else:
            lines.append("%coverLetterUrl% is empty — there is no separate cover letter to upload.")
        lines.append(f"When uploading, name the resume file '{resume_name}'.")
        lines.append("")
        lines.append(
            "CANDIDATE PROFILE — use these values; fill only the fields THIS form shows:"
        )
        lines.append(applicant_context)
        return "\n".join(lines)

    def _build_browser_settings(
        self,
        _user_data: dict,
        *,
        portal: str | None = None,
        job_url: str = "",
    ) -> dict:
        # Hosted Agents API uses camelCase browserSettings keys.
        settings: dict = {
            "solveCaptchas": True,
            "blockAds": resolve_block_ads(portal=portal, job_url=job_url),
        }
        if BROWSERBASE_PROXIES:
            settings["proxies"] = True
        return settings

    def _poll(
        self,
        run_id: str,
        application_id: str | None,
        deadline_seconds: float,
        *,
        control_token: str | None = None,
        on_gate=None,
        fetch_code=None,
        on_code=None,
    ) -> dict:
        """Poll the run to terminal, honoring stop-all, the wall-clock deadline, and —
        new — the verification gate: when the agent first hits /apply-code/{token},
        the endpoint writes apply:gate:{app_id}; this loop notices within one tick,
        fires on_gate(ts) once (status flip + notification, provided by the task), then
        interleaves deterministic fetch_code(ts) attempts every ~15s until the mailbox
        has a code (auto OR manual — the CodeModal writes the same mailbox), calling
        on_code(code) when the auto-fetch delivered it."""
        client = get_client()
        redis_client = None
        flag_key = None
        if application_id:
            try:
                redis_client = get_redis()
                flag_key = cancel_key(application_id)
            except Exception:
                redis_client = None  # Redis blip — run still proceeds, just no live cancel

        start = time.monotonic()
        gate_hit_ts: float | None = None
        gate_handled = False
        code_delivered = False
        last_fetch = 0.0
        while True:
            # Stop-all: the platform has no server-side stop (stop_run is loud
            # best-effort), but the cancel flag ALSO drives the control/code URLs to
            # CANCEL, so the live agent aborts at its pre-submit check. Scout-side the
            # apply is over either way.
            if redis_client is not None and flag_key:
                try:
                    if redis_client.get(flag_key):
                        stopped = client.stop_run(run_id)
                        logger.info(
                            "Stop-all — run %s (application %s): server-side stop %s; "
                            "agent will abort at its control-URL check.",
                            run_id, application_id,
                            "confirmed" if stopped else "unavailable",
                        )
                        return {
                            "success": False,
                            "error_code": "cancelled_by_user",
                            "error": "stopped from the tracker",
                            "needs_attention": False,
                        }
                except Exception:
                    pass  # don't let a Redis blip kill an in-flight apply

            # Hard wall-clock budget. Mark THIS attempt's token cancelled first so the
            # abandoned (unkillable) run aborts at its next control/code check instead
            # of submitting alongside the retry — that was a real duplicate-submit hole.
            if time.monotonic() - start > deadline_seconds:
                if redis_client is not None and control_token:
                    try:
                        redis_client.setex(
                            cancelled_token_key(control_token), CONTROL_TOKEN_TTL, "1"
                        )
                    except Exception:
                        pass
                stopped = client.stop_run(run_id)
                logger.error(
                    "Browserbase run %s exceeded %ss deadline (server-side stop %s; "
                    "attempt token cancelled).",
                    run_id, deadline_seconds, "confirmed" if stopped else "unavailable",
                )
                if gate_hit_ts is not None:
                    # The submission is mid-verification — a retry would re-submit the
                    # whole form and trigger a fresh code. Hand it to the user instead.
                    return {
                        "success": False,
                        "error_code": "verification_code_timeout",
                        "error": "Verification wait exceeded the apply deadline",
                        "needs_attention": True,
                        "attention_question": (
                            "This application was waiting on an emailed verification "
                            "code when time ran out. Please check the job site and "
                            "finish it manually if it did not go through."
                        ),
                    }
                return {
                    "success": False,
                    "error_code": "browser_session_lost",
                    "error": f"apply run exceeded {deadline_seconds}s deadline",
                    "needs_attention": False,
                }

            # Verification gate: first /apply-code hit stamps apply:gate:{app_id}.
            if redis_client is not None and application_id and not code_delivered:
                try:
                    if gate_hit_ts is None:
                        raw = redis_client.get(gate_key(application_id))
                        if raw:
                            gate_hit_ts = float(raw)
                    if gate_hit_ts is not None and not gate_handled:
                        gate_handled = True
                        logger.info(
                            "Verification gate active for application %s (run %s)",
                            application_id, run_id,
                        )
                        if on_gate:
                            try:
                                on_gate(gate_hit_ts)
                            except Exception:
                                logger.warning("on_gate callback failed", exc_info=True)
                    if gate_hit_ts is not None:
                        # Manual path (CodeModal) may have filled the mailbox already.
                        if redis_client.get(verification_code_key(application_id)):
                            code_delivered = True
                        elif (
                            fetch_code
                            and time.time() - gate_hit_ts <= _VERIFY_WINDOW
                            and time.monotonic() - last_fetch >= _FETCH_INTERVAL
                        ):
                            last_fetch = time.monotonic()
                            try:
                                code = fetch_code(gate_hit_ts)
                            except Exception:
                                logger.warning("fetch_code failed", exc_info=True)
                                code = None
                            if code:
                                redis_client.setex(
                                    verification_code_key(application_id),
                                    VERIFICATION_CODE_TTL,
                                    code,
                                )
                                code_delivered = True
                                logger.info(
                                    "Verification code delivered to mailbox for "
                                    "application %s", application_id,
                                )
                                if on_code:
                                    try:
                                        on_code(code)
                                    except Exception:
                                        logger.warning(
                                            "on_code callback failed", exc_info=True
                                        )
                except Exception:
                    pass  # gate handling must never kill the poll loop

            try:
                run = client.get_run(run_id)
            except Exception as exc:
                # Transient control-plane error — keep polling until the deadline.
                logger.warning("get_run %s failed (%s); retrying", run_id, exc)
                time.sleep(_POLL_INTERVAL)
                continue

            status = (run.get("status") or "").upper()
            if status in TERMINAL_STATUSES:
                logger.info("Browserbase run %s terminal: %s", run_id, status)
                return _interpret_run_result(status, run.get("result"), run.get("cause"))

            time.sleep(_POLL_INTERVAL)

    def apply(
        self,
        *,
        job_url: str,
        user_data: dict,
        resume_pdf: bytes,
        application_id: str | None = None,
        cover_letter_pdf: bytes | None = None,
        # Accepted for engine-contract parity with browser_agent.apply but NOT
        # delivered on the hosted path: the platform-side agent template only has
        # resume/cover-letter variables. Transcript uploads need the default
        # browser_use engine.
        transcript_pdf: bytes | None = None,  # noqa: ARG002
        deadline_seconds: float = 870,
        control_token: str | None = None,
        portal: str | None = None,
        on_gate=None,
        fetch_code=None,
        on_code=None,
    ) -> dict:
        """control_token: per-attempt token the task minted and mapped in Redis; when
        present (and SCOUT_PUBLIC_API_URL is set) the run gets live %controlUrl% /
        %codeUrl% endpoints — the pre-submit cancel check and the verification-code
        poll-gate. on_gate/fetch_code/on_code are the task's verification callbacks
        (see _poll). All optional: without them behavior degrades to the pre-gate
        engine (codes -> needs_attention via the manual path). `portal` drives
        Ashby-specific blockAds policy."""
        applicant_name = user_data.get("name")
        resume_name = resume_filename(applicant_name)
        cover_name = cover_letter_filename(applicant_name) if cover_letter_pdf else None

        # Object keys are personalized (ATS records the basename) and namespaced per
        # user/application. A retry (same application_id) upserts over the old object.
        prefix = f"{user_data.get('id') or 'anon'}/{application_id or uuid.uuid4().hex}"
        resume_path = f"{prefix}/{resume_name}"
        object_paths = [resume_path]

        resolved_portal = resolve_portal(portal=portal, job_url=job_url)

        # Deliver the resume (fatal on failure — there is nothing to submit without it).
        try:
            resume_url = upload_and_sign(resume_pdf, resume_path)
        except Exception as exc:
            logger.error("Resume delivery to storage failed: %s", exc)
            return {
                "success": False,
                "error_code": "resume_delivery_failed",
                "error": f"Could not stage the resume for upload: {exc}",
                "needs_attention": False,
            }

        # Cover letter is optional: a delivery failure just drops it (apply proceeds).
        cover_url = ""
        if cover_letter_pdf and cover_name:
            cover_path = f"{prefix}/{cover_name}"
            try:
                cover_url = upload_and_sign(cover_letter_pdf, cover_path)
                object_paths.append(cover_path)
            except Exception as exc:
                logger.warning("Cover letter delivery failed (proceeding without): %s", exc)
                cover_url = ""

        # Mid-run channel URLs. Empty strings when not available — the system prompt
        # explicitly degrades (skip the pre-submit check / report verification_code).
        control_url = ""
        code_url = ""
        if control_token and _PUBLIC_API_URL:
            control_url = f"{_PUBLIC_API_URL}/apply-control/{control_token}"
            code_url = f"{_PUBLIC_API_URL}/apply-code/{control_token}"
        elif control_token:
            logger.warning(
                "SCOUT_PUBLIC_API_URL not set — apply %s runs without the pre-submit "
                "cancel check and autonomous verification codes.", application_id,
            )

        try:
            agent_id = _ensure_agent()
            variables = {
                "applicationUrl": {
                    "value": job_url,
                    "description": "The job application page to complete.",
                },
                "resumeUrl": {
                    "value": resume_url,
                    "description": "Signed URL to the candidate's resume PDF.",
                },
                "coverLetterUrl": {
                    "value": cover_url,
                    "description": "Signed URL to the candidate's cover letter PDF, or empty if none.",
                },
                "controlUrl": {
                    "value": control_url,
                    "description": "Status URL to check in a new tab right before submitting (empty = skip).",
                },
                "codeUrl": {
                    "value": code_url,
                    "description": "URL that delivers emailed verification codes (empty = unavailable).",
                },
            }
            task = self._build_run_task(
                self._build_applicant_context(user_data), resume_name, cover_name
            )
            browser_settings = self._build_browser_settings(
                user_data, portal=resolved_portal, job_url=job_url
            )
            logger.info(
                "Hosted agent browser_settings for portal=%s: blockAds=%s proxies=%s",
                resolved_portal,
                browser_settings.get("blockAds"),
                browser_settings.get("proxies"),
            )

            run = get_client().run_agent(
                task=task,
                agent_id=agent_id,
                variables=variables,
                result_schema=RESULT_SCHEMA,
                browser_settings=browser_settings,
            )
            run_id = run.get("runId") or run.get("id")
            if not run_id:
                return {
                    "success": False,
                    "error_code": "browserbase_agent_failed",
                    "error": f"run_agent returned no runId: {run}",
                    "needs_attention": False,
                }
            # NOTE: run responses carry no sessionId (probed 2026-07-01) — the run id
            # is the only observability handle.
            logger.info(
                "Browserbase agent run %s started for application %s",
                run_id, application_id,
            )
            return self._poll(
                run_id,
                application_id,
                deadline_seconds,
                control_token=control_token,
                on_gate=on_gate,
                fetch_code=fetch_code,
                on_code=on_code,
            )
        except Exception as exc:
            logger.error("Browserbase apply failed to start/run: %s", exc)
            return {
                "success": False,
                "error_code": "browserbase_agent_failed",
                "error": str(exc),
                "needs_attention": False,
            }
        finally:
            # Best-effort cleanup; the short signed-URL TTL is the backstop.
            delete_objects(object_paths)


browserbase_agent = BrowserbaseAgent()

# Re-exported so the (very short) signed-URL TTL is discoverable next to the engine.
__all__ = ["browserbase_agent", "resolve_apply_company", "SIGNED_URL_TTL_SECONDS"]
