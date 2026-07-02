import json
import logging
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError

from core.ai_json import parse_ai_json_object
from core.ai_router import call_ai
from core.resume_schemas import ResumeScore

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

_SCORE_RETRY_SUFFIX = (
    "\n\nCRITICAL: Your last reply was not a valid score object. Respond with "
    "exactly one JSON object: score (integer 0-100), breakdown with keys "
    "experience, metrics, structure, keywords (each an integer 0-25 summing to "
    "score), and weaknesses (an array). No markdown fences, no explanation, no "
    "text before or after the object."
)


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")


class ResumeScorer:
    async def score_resume(self, parsed_resume: dict, target_role: str) -> dict:
        """Call score LLM with JSON mode, Gemini→Groq fallback, and one retry on
        invalid JSON or a response that fails the ResumeScore schema."""
        system = _load_prompt("score_prompt.txt")
        user_prompt = (
            f"Target role: {target_role}\n\nResume:\n{json.dumps(parsed_resume)}"
        )
        last_detail = "AI score failed schema validation"

        for attempt, task in enumerate(("fast", "quality")):
            sys = system if attempt == 0 else system + _SCORE_RETRY_SUFFIX
            ai_response = await call_ai(
                prompt=user_prompt,
                system=sys,
                task=task,
                json_mode=True,
            )

            if ai_response is None or not str(ai_response).strip():
                last_detail = "AI returned empty response"
                logger.warning("Score AI empty response attempt=%s task=%s", attempt, task)
                continue

            raw = str(ai_response)
            try:
                result = parse_ai_json_object(raw, context="Score AI")
                score = ResumeScore.model_validate(result)
                return score.model_dump()
            except HTTPException as exc:
                last_detail = str(exc.detail)
                logger.warning(
                    "Score AI JSON parse failed attempt=%s task=%s preview=%r",
                    attempt,
                    task,
                    raw[:500],
                )
            except ValidationError as exc:
                last_detail = "AI score failed schema validation"
                logger.warning(
                    "Score AI schema validation failed attempt=%s task=%s: %s",
                    attempt,
                    task,
                    exc,
                )

        raise HTTPException(status_code=500, detail=last_detail)


resume_scorer = ResumeScorer()
