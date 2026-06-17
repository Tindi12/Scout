"""Generate a tailored, human-sounding cover letter via the shared AI router.

Mirrors services/resume_rewriter.py: load a system prompt, call_ai(task="quality"),
parse + validate JSON. The AI writes only the salutation, body, and closing — the
contact header, date, and signature are injected by latex_generator at render time
(keeps contact info out of the model's reach, avoids hallucinated details).
"""

import json
import logging
from pathlib import Path

from core.ai_json import parse_ai_json_object
from core.ai_router import call_ai

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")


def _build_applicant(user_data: dict) -> dict:
    """Curated, non-sensitive profile subset handed to the model as context."""
    return {
        "name": user_data.get("name") or "",
        "school": user_data.get("school") or "",
        "degree_type": user_data.get("degree_type") or "",
        "major": user_data.get("major") or "",
        "minor": user_data.get("minor") or "",
        "education_start_date": user_data.get("education_start_date") or "",
        "education_end_date": user_data.get("education_end_date") or "",
        "city": user_data.get("address_city") or "",
        "state": user_data.get("address_state") or "",
        "work_authorization": user_data.get("work_authorization") or "",
        "target_role": user_data.get("job_title") or user_data.get("role") or "",
        # The user's optional hand-written opening / voice seed.
        "voice": user_data.get("default_cover_letter") or "",
    }


def _validate(result: dict) -> dict:
    """Coerce/validate the model output into the render contract, or raise ValueError."""
    salutation = result.get("salutation")
    closing = result.get("closing")
    paragraphs = result.get("body_paragraphs")

    if not isinstance(paragraphs, list):
        raise ValueError("cover letter body_paragraphs must be a list")
    clean_paragraphs = [str(p).strip() for p in paragraphs if str(p).strip()]
    if not clean_paragraphs:
        raise ValueError("cover letter body_paragraphs is empty")

    return {
        "salutation": str(salutation).strip() if salutation else "Dear Hiring Team,",
        "body_paragraphs": clean_paragraphs,
        "closing": str(closing).strip() if closing else "Sincerely,",
    }


class CoverLetterWriter:
    async def generate(self, *, user_data: dict, resume: dict, job: dict) -> dict:
        """
        Build a tailored cover letter for one job.

        Args:
            user_data: the user's profile row (curated internally).
            resume:    the (ideally job-tailored) structured resume JSON.
            job:       {title, company, description}.

        Returns the validated {salutation, body_paragraphs[], closing} dict.
        """
        system = _load_prompt("cover_letter_prompt.txt")
        payload = {
            "applicant": _build_applicant(user_data),
            "resume": resume,
            "job": {
                "title": job.get("title") or "",
                "company": job.get("company") or "",
                "description": (job.get("description") or "")[:6000],
            },
        }

        ai_response = await call_ai(
            prompt=json.dumps(payload),
            system=system,
            task="quality",
        )
        if ai_response is None or not str(ai_response).strip():
            raise ValueError("AI returned empty cover letter response")

        result = parse_ai_json_object(str(ai_response), context="Cover letter AI")
        return _validate(result)


cover_letter_writer = CoverLetterWriter()
