import logging
import os
from typing import AsyncIterator, Optional

from dotenv import load_dotenv
from fastapi import HTTPException
from google import genai
from groq import AsyncGroq

from core.ai_errors import (
    build_routing_failure_detail,
    http_status_for_routing_issues,
    summarize_chain_failures,
    summarize_gemini_model_error,
    summarize_groq_model_error,
)
from core.gemini_client import gemini_client
from core.gemini_models import gemini_chat_chain
from core.groq_models import groq_chain_for_task, groq_model_label

load_dotenv()

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

groq_client: Optional[AsyncGroq] = (
    AsyncGroq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
)


async def _call_gemini_model(
    model: str,
    *,
    prompt: str,
    system: str,
    json_mode: bool,
) -> str:
    config_kwargs: dict = {"system_instruction": system}
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"
        config_kwargs["max_output_tokens"] = 8192
    response = await gemini_client.aio.models.generate_content(
        model=model,
        contents=prompt,
        config=genai.types.GenerateContentConfig(**config_kwargs),
    )
    text = getattr(response, "text", None)
    text = str(text).strip() if text is not None else ""
    if not text:
        raise ValueError("Gemini returned empty text")
    return text


async def _call_gemini_chain(
    *,
    prompt: str,
    system: str,
    json_mode: bool,
) -> tuple[Optional[str], list[str]]:
    chain = gemini_chat_chain()
    model_issues: list[str] = []

    for model, label in chain:
        try:
            text = await _call_gemini_model(
                model,
                prompt=prompt,
                system=system,
                json_mode=json_mode,
            )
            if model != chain[0][0]:
                logger.info("Gemini succeeded with fallback model %s", model)
            return text, model_issues
        except Exception as exc:
            summary = summarize_gemini_model_error(label, exc)
            model_issues.append(summary)
            logger.warning("Gemini model %s failed: %s", model, exc)

    return None, model_issues


async def _call_groq_model(
    model: str,
    *,
    prompt: str,
    system: str,
    json_mode: bool,
) -> str:
    if groq_client is None:
        raise RuntimeError("GROQ_API_KEY not configured")

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
        groq_kwargs["max_completion_tokens"] = 4096

    response = await groq_client.chat.completions.create(**groq_kwargs)
    choices = getattr(response, "choices", None) or []
    msg = choices[0].message if choices else None
    content = getattr(msg, "content", None) if msg else None
    if content is not None:
        stripped = str(content).strip()
        if stripped:
            return stripped
    raise ValueError("Groq returned empty text")


async def _call_groq_chain(
    *,
    prompt: str,
    system: str,
    task: str,
    json_mode: bool,
) -> tuple[Optional[str], list[str]]:
    if groq_client is None:
        return None, ["Groq is not configured (missing GROQ_API_KEY)."]

    chain = groq_chain_for_task(task)
    model_issues: list[str] = []

    for model in chain:
        label = groq_model_label(model)
        try:
            text = await _call_groq_model(
                model,
                prompt=prompt,
                system=system,
                json_mode=json_mode,
            )
            if model != chain[0]:
                logger.info("Groq succeeded with fallback model %s (task=%s)", model, task)
            return text, model_issues
        except Exception as exc:
            summary = summarize_groq_model_error(label, exc)
            model_issues.append(summary)
            logger.warning("Groq model %s failed: %s", model, exc)

    return None, model_issues


async def call_ai(
    prompt: str,
    system: str,
    task: str = "quality",
    stream: bool = False,
    *,
    json_mode: bool = False,
) -> str:
    """Gemini multi-model chain → Groq multi-model chain."""
    if stream:
        return await _call_ai_stream(prompt=prompt, system=system, task=task)

    issues: list[str] = []
    all_model_issues: list[str] = []

    gemini_text, gemini_issues = await _call_gemini_chain(
        prompt=prompt,
        system=system,
        json_mode=json_mode,
    )
    all_model_issues.extend(gemini_issues)
    if gemini_text is not None:
        return gemini_text

    issues.append(
        summarize_chain_failures(
            "Gemini",
            gemini_issues,
            too_large_hint="250K TPM on Flash models",
        )
    )

    groq_text, groq_issues = await _call_groq_chain(
        prompt=prompt,
        system=system,
        task=task,
        json_mode=json_mode,
    )
    all_model_issues.extend(groq_issues)
    if groq_text is not None:
        return groq_text

    issues.append(
        summarize_chain_failures(
            "Groq",
            groq_issues,
            too_large_hint="up to 70k TPM on compound",
        )
    )

    detail = build_routing_failure_detail(issues)
    raise HTTPException(
        status_code=http_status_for_routing_issues(all_model_issues),
        detail=detail,
    )


async def _call_ai_stream(prompt: str, system: str, task: str):
    """Streaming: Gemini chain → Groq chain."""
    issues: list[str] = []
    gemini_stream_issues: list[str] = []

    for model, label in gemini_chat_chain():
        try:
            config = genai.types.GenerateContentConfig(system_instruction=system)
            return await gemini_client.aio.models.generate_content_stream(
                model=model,
                contents=prompt,
                config=config,
            )
        except Exception as exc:
            gemini_stream_issues.append(summarize_gemini_model_error(label, exc))
            logger.warning("Gemini stream %s failed: %s", model, exc)

    issues.append(
        summarize_chain_failures(
            "Gemini",
            gemini_stream_issues,
            too_large_hint="250K TPM on Flash models",
        )
    )

    if groq_client is not None:
        groq_stream_issues: list[str] = []
        for model in groq_chain_for_task(task):
            label = groq_model_label(model)
            try:
                return await groq_client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    stream=True,
                )
            except Exception as exc:
                groq_stream_issues.append(summarize_groq_model_error(label, exc))
                logger.warning("Groq stream %s failed: %s", model, exc)

        issues.append(
            summarize_chain_failures(
                "Groq",
                groq_stream_issues,
                too_large_hint="up to 70k TPM on compound",
            )
        )
    else:
        issues.append("Groq is not configured (missing GROQ_API_KEY).")

    detail = build_routing_failure_detail(issues)
    raise HTTPException(
        status_code=http_status_for_routing_issues(issues),
        detail=detail,
    )


# ---------------------------------------------------------------------------
# Token-streaming multi-turn chat (Copilot)
# ---------------------------------------------------------------------------
# stream_chat() is the streaming, multi-turn sibling of call_ai for chat surfaces
# (the Copilot SSE endpoint). It walks the SAME chain in the SAME order —
# Gemini chain → Groq chain — but (1) yields normalized str token deltas regardless
# of provider, and (2) accepts a multi-turn `messages` list. GPT/OpenAI is
# intentionally NOT in this path (kept isolated to the browser apply agent).
# call_ai / _call_ai_stream are left untouched.


def _to_gemini_contents(messages: list[dict]) -> list[dict]:
    """Map our [{role, content}] turns to Gemini `contents` (roles: user/model)."""
    contents: list[dict] = []
    for m in messages:
        role = "model" if m.get("role") == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": str(m.get("content", ""))}]})
    return contents


async def _stream_gemini_chat(
    system: str, contents: list[dict]
) -> AsyncIterator[str]:
    """Yield text deltas from the first Gemini model that streams; '' on total failure.

    Per-model fallback only happens BEFORE the first token — once a model has emitted
    output we cannot cleanly restart on another, so we stop and let the partial answer
    stand rather than double-answering.
    """
    for model, label in gemini_chat_chain():
        produced = False
        try:
            stream = await gemini_client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=genai.types.GenerateContentConfig(system_instruction=system),
            )
            async for chunk in stream:
                try:
                    text = chunk.text
                except Exception:
                    text = None
                if text:
                    produced = True
                    yield text
            if produced:
                return
        except Exception as exc:
            logger.warning("Gemini stream %s failed: %s", label, exc)
            if produced:
                return
            continue


async def _stream_groq_chat(
    messages: list[dict], task: str
) -> AsyncIterator[str]:
    """Yield text deltas from the first Groq model that streams; '' on total failure."""
    if groq_client is None:
        return
    for model in groq_chain_for_task(task):
        label = groq_model_label(model)
        produced = False
        try:
            stream = await groq_client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                choices = getattr(chunk, "choices", None) or []
                if not choices:
                    continue
                delta = getattr(choices[0], "delta", None)
                content = getattr(delta, "content", None) if delta else None
                if content:
                    produced = True
                    yield content
            if produced:
                return
        except Exception as exc:
            logger.warning("Groq stream %s failed: %s", label, exc)
            if produced:
                return
            continue


async def stream_chat(
    *,
    system: str,
    messages: list[dict],
    task: str = "quality",
) -> AsyncIterator[str]:
    """Stream a chat completion as str token deltas: Gemini chain → Groq chain.

    `messages` is a list of {"role": "user"|"assistant", "content": str} turns ending
    with the new user message. Raises HTTPException only if NO model in either chain
    produced any output.
    """
    produced = False

    contents = _to_gemini_contents(messages)
    async for token in _stream_gemini_chat(system, contents):
        produced = True
        yield token
    if produced:
        return

    groq_messages = [{"role": "system", "content": system}] + [
        {
            "role": "assistant" if m.get("role") == "assistant" else "user",
            "content": str(m.get("content", "")),
        }
        for m in messages
    ]
    async for token in _stream_groq_chat(groq_messages, task):
        produced = True
        yield token
    if produced:
        return

    raise HTTPException(
        status_code=503,
        detail="The assistant is temporarily unavailable. Please try again.",
    )
