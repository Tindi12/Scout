'use client'

import { AlertCircle, Menu } from 'lucide-react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { BrandedLoader } from '@/components/branded-loader'
import { ChatInput } from '@/components/copilot/ChatInput'
import {
  ConversationSidebar,
  type ConversationSummary,
} from '@/components/copilot/ConversationSidebar'
import { EXAMPLE_PROMPTS } from '@/components/copilot/constants'
import { MessageList } from '@/components/copilot/MessageList'
import { useCopilotChat } from '@/hooks/use-copilot-chat'
import { scoutLogo } from '@/lib/scout-logo'
import { cn } from '@/lib/utils'

function CopilotPageContent() {
  const searchParams = useSearchParams()
  const initialConversationId = searchParams.get('c')?.trim() || null

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const didHandoffRef = useRef(false)

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/copilot/conversations', {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as { conversations: ConversationSummary[] }
      setConversations(data.conversations ?? [])
    } catch {
      // best-effort — leave the existing list in place
    } finally {
      setListLoading(false)
    }
  }, [])

  const {
    messages,
    conversationId,
    isStreaming,
    isAwaitingFirstToken,
    error,
    limitInfo,
    sendMessage,
    loadConversation,
    reset,
  } = useCopilotChat({ onConversationCreated: () => void refreshConversations() })

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  // Mini-copilot hand-off: load the carried conversation once on mount.
  useEffect(() => {
    if (didHandoffRef.current) return
    didHandoffRef.current = true
    if (initialConversationId) {
      void loadConversation(initialConversationId)
    }
  }, [initialConversationId, loadConversation])

  const handleSelect = useCallback(
    (id: string) => {
      if (id !== conversationId) void loadConversation(id)
      setDrawerOpen(false)
    },
    [conversationId, loadConversation],
  )

  const handleNewChat = useCallback(() => {
    reset()
    setDrawerOpen(false)
  }, [reset])

  const showEmptyState = messages.length === 0

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] overflow-hidden rounded-2xl border border-white/[0.06] bg-[#080808] md:h-[calc(100dvh-7.5rem)]">
      {/* Desktop sidebar */}
      <div className="hidden w-72 shrink-0 md:block">
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          loading={listLoading}
          onSelect={handleSelect}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[80%] max-w-[20rem]">
            <ConversationSidebar
              conversations={conversations}
              activeId={conversationId}
              loading={listLoading}
              onSelect={handleSelect}
              onNewChat={handleNewChat}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Chat pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header with drawer toggle */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open conversations"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-[#888] transition-colors hover:text-white"
          >
            <Menu className="h-4 w-4" strokeWidth={2} />
          </button>
          <span className="font-headline text-sm font-semibold text-white">
            Scout Copilot
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {showEmptyState ? (
            <EmptyState
              onPick={(prompt) => void sendMessage(prompt)}
              disabled={isStreaming}
            />
          ) : (
            <MessageList
              messages={messages}
              isAwaitingFirstToken={isAwaitingFirstToken}
              limitInfo={limitInfo}
              className="mx-auto max-w-3xl"
            />
          )}
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 pb-4 md:px-6">
          {error ? (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          ) : null}
          <ChatInput
            onSend={(text) => void sendMessage(text)}
            disabled={isStreaming || limitInfo !== null}
          />
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void
  disabled: boolean
}) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FF6733]/30 bg-[#FF6733]/10">
        <Image
          src={scoutLogo}
          alt=""
          width={28}
          height={28}
          draggable={false}
          className="h-7 w-7 select-none object-contain"
        />
      </span>
      <h1 className="font-headline text-xl font-semibold text-white">
        Ask Scout anything
      </h1>
      <p className="mt-2 max-w-md font-label text-sm text-[#888]">
        Your copilot knows your profile, resume score, and application pipeline.
        Ask about your progress or what to do next.
      </p>
      <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            disabled={disabled}
            className={cn(
              'rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left font-label text-sm text-[#ccc] transition-colors',
              'hover:border-[#FF6733]/40 hover:bg-[#FF6733]/10 hover:text-white',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CopilotPage() {
  return (
    <Suspense fallback={<BrandedLoader fill label="Loading Copilot" />}>
      <CopilotPageContent />
    </Suspense>
  )
}
