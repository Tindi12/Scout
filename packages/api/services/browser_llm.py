"""
OpenAI-only LLM for Scout's browser apply agent (browser-use Agent).

Other Scout features still use core.ai_router (Gemini / Groq). This module is
only imported by services.browser_agent.
"""

from __future__ import annotations

import os
import re

from browser_use.llm.exceptions import ModelProviderError
from browser_use.llm.openai.chat import ChatOpenAI
from browser_use.llm.views import ChatInvokeCompletion

BROWSER_AGENT_MODEL = "gpt-5.4-mini"
# gpt-4o as fallback for non-parse failures (e.g. session loss, API errors).
# gpt-4o-mini is too weak for multi-step agentic form-filling.
BROWSER_AGENT_FALLBACK_MODEL = "gpt-4o"


def _extract_first_json_object(text: str) -> str:
    """
    Return the first complete JSON object from text, stripping markdown fences
    and any trailing content after the closing brace.
    """
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    in_string = False
    i = start
    while i < len(text):
        c = text[i]
        if c == "\\" and in_string:
            i += 2
            continue
        if c == '"':
            in_string = not in_string
        elif not in_string:
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        i += 1
    return text[start:]


class _RobustChatOpenAI(ChatOpenAI):
    """
    Thin subclass of browser-use's ChatOpenAI that recovers from trailing-character
    JSON parse errors without switching to a weaker fallback model.

    Root cause: gpt-5.4-mini with strict json_schema mode occasionally appends a
    brief comment after the closing brace, causing Pydantic's model_validate_json
    to raise "Invalid JSON: trailing characters at line 2 column 1". This is
    intermittent and independent of reasoning_models / use_thinking settings.

    Recovery: on parse failure, makes a second call in text mode (no json_schema
    constraint) and extracts the JSON object manually. The second call uses the
    same capable model so agentic quality is preserved.
    """

    async def ainvoke(self, messages, output_format=None, **kwargs):
        if output_format is None:
            return await super().ainvoke(messages, output_format, **kwargs)
        try:
            return await super().ainvoke(messages, output_format, **kwargs)
        except ModelProviderError as exc:
            if "trailing characters" not in str(exc).lower():
                raise
            # Primary call returned valid JSON + trailing text that strict-mode
            # should have prevented. Recover by getting the raw text and
            # extracting the JSON object ourselves.
            raw = await super().ainvoke(messages, output_format=None, **kwargs)
            json_str = _extract_first_json_object(raw.completion)
            parsed = output_format.model_validate_json(json_str)
            return ChatInvokeCompletion(
                completion=parsed,
                usage=raw.usage,
                stop_reason=raw.stop_reason,
            )


def ScoutBrowserLLM(*, temperature: float = 0, task: str = "") -> _RobustChatOpenAI:
    """
    Primary LLM for browser automation steps.

    reasoning_models=[] prevents browser-use from treating gpt-5.4-mini as a
    reasoning model (it substring-matches 'gpt-5' by default), which would strip
    temperature and add reasoning_effort — neither of which we want for
    deterministic, low-latency form filling.
    """
    _ = task
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY must be set for browser agent")
    return _RobustChatOpenAI(
        model=BROWSER_AGENT_MODEL,
        api_key=api_key,
        temperature=temperature,
        reasoning_models=[],
    )


def ScoutBrowserFallbackLLM(*, temperature: float = 0) -> _RobustChatOpenAI:
    """
    Fallback LLM for browser-use step-level failures unrelated to JSON parsing
    (e.g. API errors, session loss, the primary model genuinely failing a step).

    Uses gpt-4o rather than gpt-4o-mini: gpt-4o-mini lacks the agentic reasoning
    needed to navigate multi-step application forms reliably.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY must be set for browser agent")
    return _RobustChatOpenAI(
        model=BROWSER_AGENT_FALLBACK_MODEL,
        api_key=api_key,
        temperature=temperature,
        reasoning_models=[],
    )
