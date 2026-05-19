"""
Gemini models available on Scout's AI Studio quota, ordered for fallback chains.

Chat chain (power ↓, then TPM/RPD volume):
  1. Gemini 3 Flash        — primary; newest Flash (250K TPM, 5 RPM, 20 RPD)
  2. Gemini 2.5 Flash      — same TPM tier, proven quality
  3. Gemini 3.1 Flash Lite — high volume (250K TPM, 15 RPM, 500 RPD)
  4. Gemini 2.5 Flash Lite — lighter Flash (250K TPM, 10 RPM)
  5. Gemma 4 31B           — unlimited TPM, 15 RPM, 1.5K RPD
  6. Gemma 4 26B           — smaller Gemma, unlimited TPM

Excluded (0 quota or wrong modality): 2.5 Pro, 2 Flash, 2 Flash Lite,
3.1 Pro, TTS, Imagen, Live API, Robotics, Computer Use.

Embeddings (embedding_service.py): OpenAI ada-002 → Gemini Embedding 2 → Gemini Embedding 1
"""

from __future__ import annotations

GEMINI_CHAT_MODELS: tuple[tuple[str, str], ...] = (
    ("gemini-3-flash-preview", "Gemini 3 Flash"),
    ("gemini-2.5-flash", "Gemini 2.5 Flash"),
    ("gemini-3.1-flash-lite-preview", "Gemini 3.1 Flash Lite"),
    ("gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite"),
    ("gemma-4-31b-it", "Gemma 4 31B"),
    ("gemma-4-26b-it", "Gemma 4 26B"),
)

# Older / alternate API ids if Google renames models in AI Studio
GEMINI_CHAT_MODEL_ALIASES: tuple[tuple[str, str], ...] = (
    ("gemini-3-flash", "Gemini 3 Flash"),
    ("gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite"),
    ("gemma-3-27b-it", "Gemma 3 27B"),
    ("gemma-3-12b-it", "Gemma 3 12B"),
)

GEMINI_EMBEDDING_MODELS: tuple[tuple[str, str], ...] = (
    ("gemini-embedding-002", "Gemini Embedding 2"),
    ("gemini-embedding-001", "Gemini Embedding 1"),
)

# Match pgvector columns sized for text-embedding-ada-002 (1536 dims).
EMBEDDING_DIMENSION = 1536

OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002"

GEMINI_PRIMARY_CHAT_MODEL = GEMINI_CHAT_MODELS[0][0]


def gemini_chat_chain() -> tuple[tuple[str, str], ...]:
    """Return (model_id, label) pairs in fallback order."""
    chain: list[tuple[str, str]] = list(GEMINI_CHAT_MODELS)
    seen = {m for m, _ in chain}
    for model_id, label in GEMINI_CHAT_MODEL_ALIASES:
        if model_id not in seen:
            chain.append((model_id, label))
            seen.add(model_id)
    return tuple(chain)


def gemini_embedding_chain() -> tuple[tuple[str, str], ...]:
    return GEMINI_EMBEDDING_MODELS
