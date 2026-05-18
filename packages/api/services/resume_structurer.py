"""Turn extracted resume text into structured JSON via the parse prompt."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import HTTPException

from core.ai_json import parse_ai_json_object
from core.ai_router import call_ai

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_MAX_RESUME_TEXT_CHARS = 48_000

_PARSE_RETRY_SUFFIX = (
    "\n\nCRITICAL: Your last reply was not valid JSON. "
    "Respond with exactly one JSON object matching the schema. "
    "No markdown fences, no explanation, no text before or after the object."
)


def _load_parse_prompt() -> str:
    return (_PROMPTS_DIR / "parse_prompt.txt").read_text(encoding="utf-8")


def _truncate_resume_text(raw_text: str) -> str:
    text = raw_text.strip()
    if len(text) <= _MAX_RESUME_TEXT_CHARS:
        return text
    logger.warning(
        "Resume text truncated for parse",
        extra={"original_chars": len(text), "limit": _MAX_RESUME_TEXT_CHARS},
    )
    return (
        text[:_MAX_RESUME_TEXT_CHARS]
        + "\n\n[... remainder of resume omitted due to length ...]"
    )


async def structure_resume_text(raw_text: str) -> dict:
    """
    Call parse LLM with JSON mode, Groq→Gemini fallback, and one retry on bad JSON.
    """
    system = _load_parse_prompt()
    prompt = _truncate_resume_text(raw_text)
    last_detail = "Parse AI returned invalid JSON"

    for attempt, task in enumerate(("fast", "quality")):
        sys = system if attempt == 0 else system + _PARSE_RETRY_SUFFIX
        ai_response = await call_ai(
            prompt=prompt,
            system=sys,
            task=task,
            json_mode=True,
        )
        if ai_response is None or not str(ai_response).strip():
            last_detail = "AI returned empty response"
            logger.warning("Parse AI empty response attempt=%s task=%s", attempt, task)
            continue

        raw = str(ai_response)
        try:
            return parse_ai_json_object(raw, context="Parse AI")
        except HTTPException as exc:
            last_detail = str(exc.detail)
            logger.warning(
                "Parse AI JSON parse failed attempt=%s task=%s preview=%r",
                attempt,
                task,
                raw[:500],
            )

    raise HTTPException(status_code=500, detail=last_detail)
