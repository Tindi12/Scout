'use client'

import { useEffect, useRef } from 'react'

import type { ChatMessage, LimitInfo } from '@/hooks/use-copilot-chat'

import { MessageBubble } from './MessageBubble'
import { UpgradePrompt } from './UpgradePrompt'

export function MessageList({
  messages,
  isAwaitingFirstToken,
  limitInfo = null,
  className,
}: {
  messages: ChatMessage[]
  isAwaitingFirstToken: boolean
  /** When set, an inline upgrade prompt is rendered after the messages. */
  limitInfo?: LimitInfo | null
  className?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the newest content while messages grow / stream / on a limit prompt.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isAwaitingFirstToken, limitInfo])

  return (
    <div className={className}>
      <div className="space-y-4">
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1
          const showTyping =
            isLast &&
            message.role === 'assistant' &&
            message.content === '' &&
            isAwaitingFirstToken
          return (
            <MessageBubble
              key={index}
              message={message}
              showTyping={showTyping}
            />
          )
        })}
        {limitInfo ? <UpgradePrompt info={limitInfo} /> : null}
        <div ref={endRef} />
      </div>
    </div>
  )
}
