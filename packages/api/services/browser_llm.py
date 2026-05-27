"""
Browser-use LLM that mirrors Scout's call_ai routing: Gemini chain → Groq chain.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, TypeVar, overload

from browser_use.llm.exceptions import ModelProviderError
from browser_use.llm.google.chat import ChatGoogle
from browser_use.llm.groq.chat import ChatGroq
from browser_use.llm.messages import BaseMessage
from browser_use.llm.views import ChatInvokeCompletion
from pydantic import BaseModel

from core.gemini_models import GEMINI_PRIMARY_CHAT_MODEL, gemini_chat_chain
from core.groq_models import groq_chain_for_task, groq_model_label

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


@dataclass
class ScoutBrowserLLM:
    """Gemini multi-model chain → Groq multi-model chain (same order as core.ai_router.call_ai)."""

    _verified_api_keys: bool = False
    task: str = "quality"
    temperature: float = 0
    gemini_api_key: str | None = field(default_factory=lambda: os.getenv("GEMINI_API_KEY"))
    groq_api_key: str | None = field(default_factory=lambda: os.getenv("GROQ_API_KEY"))

    @property
    def model(self) -> str:
        chain = gemini_chat_chain()
        return chain[0][0] if chain else GEMINI_PRIMARY_CHAT_MODEL

    @property
    def model_name(self) -> str:
        """Legacy alias expected by browser-use (cloud events, token tracking)."""
        return self.model

    @property
    def provider(self) -> str:
        return "scout"

    @property
    def name(self) -> str:
        return f"scout/{self.model}"

    @overload
    async def ainvoke(
        self,
        messages: list[BaseMessage],
        output_format: None = None,
        **kwargs: Any,
    ) -> ChatInvokeCompletion[str]: ...

    @overload
    async def ainvoke(
        self,
        messages: list[BaseMessage],
        output_format: type[T],
        **kwargs: Any,
    ) -> ChatInvokeCompletion[T]: ...

    async def ainvoke(
        self,
        messages: list[BaseMessage],
        output_format: type[T] | None = None,
        **kwargs: Any,
    ) -> ChatInvokeCompletion[T] | ChatInvokeCompletion[str]:
        errors: list[str] = []

        if self.gemini_api_key:
            for model_id, label in gemini_chat_chain():
                llm = ChatGoogle(
                    model=model_id,
                    api_key=self.gemini_api_key,
                    temperature=self.temperature,
                )
                try:
                    result = await llm.ainvoke(messages, output_format, **kwargs)
                    if model_id != self.model:
                        logger.info("Browser agent using Gemini fallback %s", model_id)
                    return result
                except Exception as exc:
                    msg = f"Gemini {label}: {exc}"
                    errors.append(msg)
                    logger.warning("Browser agent %s", msg)
        else:
            errors.append("Gemini not configured (missing GEMINI_API_KEY)")

        if self.groq_api_key:
            groq_chain = groq_chain_for_task(self.task)
            for model_id in groq_chain:
                label = groq_model_label(model_id)
                llm = ChatGroq(
                    model=model_id,
                    api_key=self.groq_api_key,
                    temperature=self.temperature,
                )
                try:
                    result = await llm.ainvoke(messages, output_format, **kwargs)
                    if model_id != groq_chain[0]:
                        logger.info(
                            "Browser agent using Groq fallback %s (task=%s)",
                            model_id,
                            self.task,
                        )
                    return result
                except Exception as exc:
                    msg = f"Groq {label}: {exc}"
                    errors.append(msg)
                    logger.warning("Browser agent %s", msg)
        else:
            errors.append("Groq not configured (missing GROQ_API_KEY)")

        summary = "; ".join(errors[-4:]) if errors else "no providers configured"
        raise ModelProviderError(
            message=f"All Scout browser LLM fallbacks failed. {summary}",
            status_code=503,
            model=self.model,
        )
