'use client'

import { useCallback, useRef, useState } from 'react'

import { ANALYTICS_EVENTS, track } from '@/lib/analytics'

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

/** Free-tier daily limit hit — rendered inline as an upgrade prompt, not an error. */
export type LimitInfo = {
  message: string
  plan: string
  price: string
}

type SseEvent =
  | { type: 'meta'; conversation_id: string }
  | { type: 'token'; content: string }
  | { type: 'error'; detail: string }
  | {
      type: 'limit_reached'
      message: string
      upsell: { plan: string; price: string }
    }
  | { type: 'done' }

type UseCopilotChatOptions = {
  /** Called once when a brand-new conversation gets its id (null -> id). Useful
   * for refreshing a conversation list so the new thread appears. */
  onConversationCreated?: (conversationId: string) => void
}

export type UseCopilotChat = {
  messages: ChatMessage[]
  conversationId: string | null
  isStreaming: boolean
  /** True until the first assistant token of the in-progress response arrives. */
  isAwaitingFirstToken: boolean
  error: string | null
  /** Set when a free user is over their daily limit; the UI shows an upgrade prompt
   * and disables input. Null otherwise. */
  limitInfo: LimitInfo | null
  sendMessage: (text: string) => Promise<void>
  loadConversation: (id: string) => Promise<void>
  reset: () => void
}

const GENERIC_ERROR =
  'Something went wrong reaching the assistant. Please try again.'

export function useCopilotChat(
  options: UseCopilotChatOptions = {},
): UseCopilotChat {
  const { onConversationCreated } = options

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isAwaitingFirstToken, setIsAwaitingFirstToken] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limitInfo, setLimitInfo] = useState<LimitInfo | null>(null)

  // Ref mirror so the streaming closure always reads the latest id without
  // re-binding, and so onConversationCreated fires exactly once.
  const conversationIdRef = useRef<string | null>(null)
  const streamingRef = useRef(false)

  const reset = useCallback(() => {
    if (streamingRef.current) return
    setMessages([])
    setConversationId(null)
    conversationIdRef.current = null
    setError(null)
    setLimitInfo(null)
    setIsAwaitingFirstToken(false)
  }, [])

  const loadConversation = useCallback(
    async (id: string) => {
      if (streamingRef.current) return
      setError(null)
      setLimitInfo(null)
      try {
        const res = await fetch(
          `/api/copilot/conversations/${encodeURIComponent(id)}`,
          { cache: 'no-store' },
        )
        if (!res.ok) {
          setError('Could not load that conversation.')
          return
        }
        const data = (await res.json()) as { id: string; messages: ChatMessage[] }
        setMessages(
          (data.messages ?? []).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        )
        setConversationId(data.id)
        conversationIdRef.current = data.id
      } catch {
        setError('Could not load that conversation.')
      }
    },
    [],
  )

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streamingRef.current) return

      // Feature usage. NEVER include message content — tier rides along as a
      // registered super property, so no per-call tier wiring is needed.
      track(ANALYTICS_EVENTS.COPILOT_MESSAGE_SENT, {
        is_new_conversation: conversationIdRef.current === null,
      })

      setError(null)
      setLimitInfo(null)
      streamingRef.current = true
      setIsStreaming(true)
      setIsAwaitingFirstToken(true)

      // Optimistically render the user turn and an empty assistant turn that we
      // append tokens onto as they stream in.
      const assistantIndexRef = { current: -1 }
      setMessages((prev) => {
        const next = [
          ...prev,
          { role: 'user' as const, content: trimmed },
          { role: 'assistant' as const, content: '' },
        ]
        assistantIndexRef.current = next.length - 1
        return next
      })

      const appendToAssistant = (token: string) => {
        setMessages((prev) => {
          const idx = assistantIndexRef.current
          if (idx < 0 || idx >= prev.length) return prev
          const next = [...prev]
          next[idx] = { ...next[idx], content: next[idx].content + token }
          return next
        })
      }

      let sawError = false
      // A limit_reached event also has no assistant content, so it shares the
      // empty-bubble cleanup with errors — but it's an upgrade prompt, not an error.
      let sawLimit = false

      try {
        const res = await fetch('/api/copilot/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversationIdRef.current,
            message: trimmed,
          }),
        })

        if (!res.ok || !res.body) {
          let detail = GENERIC_ERROR
          try {
            const body = (await res.json()) as { detail?: string }
            if (body?.detail) detail = body.detail
          } catch {
            // keep generic
          }
          setError(detail)
          sawError = true
        } else {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          const handleEvent = (raw: string) => {
            // Each SSE record is one or more `data:` lines; we emit single-line
            // JSON payloads from the backend.
            const dataLines = raw
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
            if (dataLines.length === 0) return
            const payload = dataLines.join('')
            if (!payload) return
            let evt: SseEvent
            try {
              evt = JSON.parse(payload) as SseEvent
            } catch {
              return
            }
            if (evt.type === 'meta') {
              const wasNull = conversationIdRef.current === null
              conversationIdRef.current = evt.conversation_id
              setConversationId(evt.conversation_id)
              if (wasNull) onConversationCreated?.(evt.conversation_id)
            } else if (evt.type === 'token') {
              setIsAwaitingFirstToken(false)
              appendToAssistant(evt.content)
            } else if (evt.type === 'limit_reached') {
              setIsAwaitingFirstToken(false)
              setLimitInfo({
                message: evt.message,
                plan: evt.upsell.plan,
                price: evt.upsell.price,
              })
              sawLimit = true
            } else if (evt.type === 'error') {
              setError(evt.detail || GENERIC_ERROR)
              sawError = true
            }
            // 'done' needs no special handling — the stream ends after it.
          }

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            // SSE records are separated by a blank line.
            let sepIndex: number
            while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
              const record = buffer.slice(0, sepIndex)
              buffer = buffer.slice(sepIndex + 2)
              handleEvent(record)
            }
          }
          if (buffer.trim()) handleEvent(buffer)
        }
      } catch {
        setError(GENERIC_ERROR)
        sawError = true
      } finally {
        streamingRef.current = false
        setIsStreaming(false)
        setIsAwaitingFirstToken(false)

        // If the assistant bubble is still empty (error, or a limit_reached that
        // produced no tokens), drop it so we don't leave a blank message behind. The
        // user's message stays in the thread so the upgrade prompt reads as a reply.
        if (sawError || sawLimit) {
          setMessages((prev) => {
            const idx = assistantIndexRef.current
            if (idx >= 0 && idx < prev.length && prev[idx].content === '') {
              return prev.filter((_, i) => i !== idx)
            }
            return prev
          })
        }
      }
    },
    [onConversationCreated],
  )

  return {
    messages,
    conversationId,
    isStreaming,
    isAwaitingFirstToken,
    error,
    limitInfo,
    sendMessage,
    loadConversation,
    reset,
  }
}
