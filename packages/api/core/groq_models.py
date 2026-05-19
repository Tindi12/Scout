"""
Groq chat models available on Scout's on-demand tier, ordered for fallback.

TPM/RPD from Groq console (on-demand). Prompt-guard models omitted — not for resume work.
"""

from __future__ import annotations

# (model_id, tpm_limit) — informational; ordering is what matters for fallback.
GROQ_MODEL_LIMITS: dict[str, int] = {
    "groq/compound-mini": 70_000,
    "groq/compound": 70_000,
    "meta-llama/llama-4-scout-17b-16e-instruct": 30_000,
    "llama-3.3-70b-versatile": 12_000,
    "openai/gpt-oss-120b": 8_000,
    "openai/gpt-oss-20b": 8_000,
    "qwen/qwen3-32b": 6_000,
    "llama-3.1-8b-instant": 6_000,
    "allam-2-7b": 6_000,
}

# High-TPM models first (large resume parse), then task-tuned models.
_GROQ_HIGH_TPM = (
    "groq/compound-mini",
    "groq/compound",
    "meta-llama/llama-4-scout-17b-16e-instruct",
)

_GROQ_FAST_TAIL = (
    "llama-3.1-8b-instant",
    "qwen/qwen3-32b",
    "allam-2-7b",
)

_GROQ_QUALITY_TAIL = (
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
)


def _dedupe_preserve_order(*parts: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        for model in part:
            if model not in seen:
                seen.add(model)
                out.append(model)
    return tuple(out)


# task="fast"  → prefer 8b-class after high-TPM tier
GROQ_CHAIN_FAST: tuple[str, ...] = _dedupe_preserve_order(
    _GROQ_HIGH_TPM,
    _GROQ_FAST_TAIL,
    _GROQ_QUALITY_TAIL,
)

# task="quality" → prefer 70b / oss after high-TPM tier
GROQ_CHAIN_QUALITY: tuple[str, ...] = _dedupe_preserve_order(
    _GROQ_HIGH_TPM,
    _GROQ_QUALITY_TAIL,
    _GROQ_FAST_TAIL,
)


def groq_chain_for_task(task: str) -> tuple[str, ...]:
    if task == "fast":
        return GROQ_CHAIN_FAST
    return GROQ_CHAIN_QUALITY


def groq_model_label(model: str) -> str:
    if model.startswith("groq/"):
        return model.removeprefix("groq/")
    if model.startswith("meta-llama/"):
        return model.removeprefix("meta-llama/")
    if model.startswith("openai/"):
        return model.removeprefix("openai/")
    return model.split("/")[-1] if "/" in model else model
