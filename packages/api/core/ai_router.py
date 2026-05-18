import logging
import os
from typing import Optional

from dotenv import load_dotenv
from groq import AsyncGroq
from google import genai
from groq import RateLimitError
from fastapi import HTTPException

load_dotenv()

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not set")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set")

groq_client = AsyncGroq(api_key=GROQ_API_KEY)

gemini_client = genai.Client(api_key=GEMINI_API_KEY)


async def call_ai(
    prompt: str,
    system: str,
    task: str = "quality",
    stream: bool = False,
    *,
    json_mode: bool = False,
) -> str:
    """
    Prefer Groq; if Groq returns empty content, errors, or rate-limits, fall back to Gemini.
    Empty Llama completions are common enough that failing hard breaks /resume/analyze.
    """
    model = "llama-3.1-8b-instant" if task == "fast" else "llama-3.3-70b-versatile"

    if stream:
        try:
            return await groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI routing failed: {str(e)}")

    async def gemini_text() -> str:
        config_kwargs: dict = {"system_instruction": system}
        if json_mode:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["max_output_tokens"] = 8192
        response = await gemini_client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(**config_kwargs),
        )
        text = getattr(response, "text", None)
        text = str(text).strip() if text is not None else ""
        if not text:
            raise ValueError("Gemini returned empty text")
        return text

    groq_issue: Optional[str] = None

    groq_kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
    }
    if json_mode:
        groq_kwargs["response_format"] = {"type": "json_object"}
        groq_kwargs["max_completion_tokens"] = 8192

    try:
        response = await groq_client.chat.completions.create(**groq_kwargs)
        choices = getattr(response, "choices", None) or []
        msg = choices[0].message if choices else None
        content = getattr(msg, "content", None) if msg else None
        if content is not None:
            stripped = str(content).strip()
            if stripped:
                return stripped
        groq_issue = "Groq returned an empty completion"
        logger.warning("%s model=%s", groq_issue, model)
    except RateLimitError as e:
        groq_issue = f"Groq rate limited: {e}"
        logger.warning(groq_issue)
    except Exception as e:
        groq_issue = f"Groq request failed: {e}"
        logger.warning(groq_issue)

    try:
        return await gemini_text()
    except Exception as e:
        logger.exception(
            "Gemini fallback failed after Groq issue (%s)", groq_issue or "unknown"
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"AI routing failed"
                + (f" ({groq_issue})" if groq_issue else "")
                + f"; fallback failed: {str(e)}"
            ),
        ) from e
