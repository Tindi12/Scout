from core.ai_errors import (
    build_routing_failure_detail,
    http_status_for_routing_issues,
    summarize_gemini_model_error,
    summarize_groq_model_error,
    summarize_provider_error,
)
from core.gemini_models import GEMINI_CHAT_MODELS, gemini_chat_chain
from core.groq_models import GROQ_CHAIN_FAST, GROQ_CHAIN_QUALITY


def test_summarize_groq_tpm_too_large():
    raw = (
        "Error code: 413 - {'error': {'message': 'Request too large for model "
        "`llama-3.1-8b-instant` ... Limit 6000, Requested 9417'}}"
    )
    msg = summarize_groq_model_error("llama-3.1-8b-instant", Exception(raw))
    assert "9,417" in msg
    assert "6,000" in msg
    assert "llama-3.1-8b" in msg
    assert "RESOURCE_EXHAUSTED" not in msg


def test_groq_chains_include_high_tpm_models():
    assert GROQ_CHAIN_FAST[0] == "groq/compound-mini"
    assert "meta-llama/llama-4-scout-17b-16e-instruct" in GROQ_CHAIN_FAST
    assert GROQ_CHAIN_QUALITY[0] == "groq/compound-mini"
    assert "llama-3.3-70b-versatile" in GROQ_CHAIN_QUALITY


def test_gemini_chat_chain_power_then_volume():
    chain = [m for m, _ in gemini_chat_chain()]
    assert chain[0] == "gemini-3.5-flash"
    assert "gemini-3.5-flash" in chain
    assert "gemini-2.5-flash" in chain
    assert "gemini-3.1-flash-lite" in chain
    assert "gemma-4-31b-it" in chain
    assert len(GEMINI_CHAT_MODELS) >= 6


def test_summarize_gemini_quota():
    raw = (
        "429 RESOURCE_EXHAUSTED. quota exceeded for free_tier_requests, limit: 0. "
        "Please retry in 53.86s."
    )
    msg = summarize_provider_error("Gemini", Exception(raw))
    assert "quota" in msg.lower()
    assert "free" in msg.lower()
    assert len(msg) < 200


def test_build_failure_detail_lists_providers():
    detail = build_routing_failure_detail(
        [
            "Gemini rate limit — retry in about 54s.",
            "Groq: request too large (~9,417 tokens; on-demand TPM limit 6,000 for this model).",
        ]
    )
    assert "all providers" in detail.lower()
    assert "•" in detail
    assert "shorter resume" in detail.lower()


def test_http_status_for_payload():
    assert http_status_for_routing_issues(["Groq: request too large"]) == 413
    assert http_status_for_routing_issues(["Gemini rate limit"]) == 503
