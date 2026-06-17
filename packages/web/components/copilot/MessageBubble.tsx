'use client'

import Image from 'next/image'

import { scoutLogo } from '@/lib/scout-logo'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/hooks/use-copilot-chat'

import { MarkdownMessage } from './MarkdownMessage'
import { TypingIndicator } from './TypingIndicator'

export function MessageBubble({
  message,
  showTyping = false,
}: {
  message: ChatMessage
  /** Render the typing indicator instead of (empty) content. */
  showTyping?: boolean
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[#FF6733] px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-[0_2px_12px_rgba(255,103,51,0.25)]">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04]">
        <Image
          src={scoutLogo}
          alt=""
          width={16}
          height={16}
          draggable={false}
          className="h-4 w-4 select-none object-contain"
        />
      </span>
      <div
        className={cn(
          'max-w-[85%] break-words rounded-2xl rounded-tl-sm border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5',
        )}
      >
        {showTyping ? (
          <TypingIndicator />
        ) : (
          <MarkdownMessage content={message.content} />
        )}
      </div>
    </div>
  )
}
