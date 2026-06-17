'use client'

import { Plus, X } from 'lucide-react'

import { cn } from '@/lib/utils'

import { relativeTime } from './constants'

export type ConversationSummary = {
  id: string
  snippet: string
  updated_at: string | null
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNewChat,
  onClose,
  className,
}: {
  conversations: ConversationSummary[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onNewChat: () => void
  /** Provided only in the mobile drawer to render a close affordance. */
  onClose?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-white/[0.06] bg-[#0a0a0a]',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-label text-sm font-medium text-white transition-colors hover:border-[#FF6733]/40 hover:bg-[#FF6733]/10"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New chat
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversations"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-[#888] transition-colors hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-white/[0.03]"
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-6 text-center font-label text-xs text-[#555]">
            No conversations yet. Start a new chat to get going.
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => {
              const active = c.id === activeId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      'group flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-[#FF6733]/40 bg-[#FF6733]/10'
                        : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.03]',
                    )}
                  >
                    <span
                      className={cn(
                        'line-clamp-1 font-label text-[13px] font-medium',
                        active ? 'text-white' : 'text-[#bbb]',
                      )}
                    >
                      {c.snippet}
                    </span>
                    <span className="font-label text-[11px] text-[#555]">
                      {relativeTime(c.updated_at)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
