import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from core.ai_router import stream_chat
from core.auth import verify_resume_api_user
from core.supabase_client import supabase
from services.copilot_context import build_context_block

logger = logging.getLogger(__name__)

router = APIRouter()

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_COPILOT_SYSTEM = (_PROMPTS_DIR / "copilot_system.txt").read_text(encoding="utf-8")

# Bound the history we feed the LLM (5 exchanges). The full thread still persists.
_HISTORY_LIMIT = 10


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str = Field(..., min_length=1, max_length=8000)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _fetch_user(clerk_id: str) -> dict | None:
    result = (
        supabase.table("users")
        .select(
            "id, name, school, degree_type, major, education_end_date, "
            "work_authorization, requires_sponsorship"
        )
        .eq("clerk_id", clerk_id)
        .maybe_single()
        .execute()
    )
    return result.data


def _fetch_conversation(conversation_id: str, user_id: str) -> dict | None:
    """Load a conversation, verifying it belongs to this user (ownership check)."""
    result = (
        supabase.table("conversations")
        .select("id, messages")
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return result.data


def _create_conversation(user_id: str) -> dict:
    result = (
        supabase.table("conversations")
        .insert({"user_id": user_id, "messages": []})
        .execute()
    )
    rows = result.data if isinstance(result.data, list) else (
        [result.data] if result.data else []
    )
    if not rows or "id" not in rows[0]:
        raise HTTPException(status_code=500, detail="Could not start a conversation")
    return rows[0]


def _persist_messages(
    conversation_id: str,
    user_id: str,
    full_history: list[dict],
    user_message: str,
    assistant_message: str,
) -> None:
    """Append the user message (always) and assistant message (if any) to the jsonb
    array, and bump updated_at. Ownership re-checked via the user_id filter."""
    now = datetime.now(timezone.utc).isoformat()
    new_messages = list(full_history)
    new_messages.append({"role": "user", "content": user_message, "timestamp": now})
    if assistant_message:
        new_messages.append(
            {"role": "assistant", "content": assistant_message, "timestamp": now}
        )
    supabase.table("conversations").update(
        {"messages": new_messages, "updated_at": now}
    ).eq("id", conversation_id).eq("user_id", user_id).execute()


_SNIPPET_MAX = 80


def _first_user_snippet(messages: list[dict]) -> str:
    """Derive a conversation title from the first user message (there is no title
    column). Truncated and whitespace-collapsed; empty string when none exists."""
    if not isinstance(messages, list):
        return ""
    for m in messages:
        if not isinstance(m, dict):
            continue
        if m.get("role") == "user" and isinstance(m.get("content"), str):
            text = " ".join(m["content"].split()).strip()
            if not text:
                continue
            if len(text) > _SNIPPET_MAX:
                return text[: _SNIPPET_MAX - 1].rstrip() + "…"
            return text
    return ""


def _list_conversations(user_id: str) -> list[dict]:
    result = (
        supabase.table("conversations")
        .select("id, messages, updated_at, created_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


def _to_llm_messages(history: list[dict]) -> list[dict]:
    """Keep only well-formed user/assistant turns for the LLM call."""
    out: list[dict] = []
    for m in history:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content:
            out.append({"role": role, "content": content})
    return out


@router.post("/chat")
async def copilot_chat(
    body: ChatRequest,
    current_user: dict = Depends(verify_resume_api_user),
) -> StreamingResponse:
    clerk_id = current_user["sub"]

    user_row = await run_in_threadpool(_fetch_user, clerk_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_row["id"]

    # Resolve (or create) the conversation up front so the client gets its id.
    if body.conversation_id:
        convo = await run_in_threadpool(
            _fetch_conversation, body.conversation_id, user_id
        )
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        convo = await run_in_threadpool(_create_conversation, user_id)
    conversation_id = convo["id"]
    full_history = convo.get("messages") or []

    # Build the system prompt + CONTEXT and the bounded message list.
    context_block = await run_in_threadpool(build_context_block, user_row)
    system = _COPILOT_SYSTEM
    if context_block:
        system = f"{_COPILOT_SYSTEM}\n\n# CONTEXT\n{context_block}"

    recent = _to_llm_messages(full_history)[-_HISTORY_LIMIT:]
    llm_messages = recent + [{"role": "user", "content": body.message}]

    async def event_stream() -> AsyncIterator[str]:
        yield _sse({"type": "meta", "conversation_id": conversation_id})

        assistant_parts: list[str] = []
        try:
            async for token in stream_chat(system=system, messages=llm_messages):
                assistant_parts.append(token)
                yield _sse({"type": "token", "content": token})
        except Exception as e:
            logger.error("Copilot stream failed (conversation %s): %s", conversation_id, e)
            yield _sse(
                {
                    "type": "error",
                    "detail": "The assistant is temporarily unavailable. Please try again.",
                }
            )

        assistant_message = "".join(assistant_parts)

        # Persist user message (always) + assistant message (if produced). A DB error
        # here must not crash a response we've already streamed — log and move on.
        try:
            await run_in_threadpool(
                _persist_messages,
                conversation_id,
                user_id,
                full_history,
                body.message,
                assistant_message,
            )
        except Exception as e:
            logger.error("Copilot persistence failed (conversation %s): %s", conversation_id, e)

        yield _sse({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
async def list_conversations(
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    """List the current user's conversations, newest first. Title is derived from
    the first user message since there is no title column."""
    clerk_id = current_user["sub"]
    user_row = await run_in_threadpool(_fetch_user, clerk_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_row["id"]

    rows = await run_in_threadpool(_list_conversations, user_id)
    conversations = []
    for row in rows:
        snippet = _first_user_snippet(row.get("messages") or [])
        if not snippet:
            # Skip empty conversations that never received a user message.
            continue
        conversations.append(
            {
                "id": row.get("id"),
                "snippet": snippet,
                "updated_at": row.get("updated_at") or row.get("created_at"),
            }
        )
    return {"conversations": conversations}


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(verify_resume_api_user),
) -> dict:
    """Fetch all messages for one conversation, verifying ownership."""
    clerk_id = current_user["sub"]
    user_row = await run_in_threadpool(_fetch_user, clerk_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_row["id"]

    convo = await run_in_threadpool(_fetch_conversation, conversation_id, user_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = []
    for m in convo.get("messages") or []:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content:
            messages.append(
                {"role": role, "content": content, "timestamp": m.get("timestamp")}
            )
    return {"id": convo.get("id"), "messages": messages}
