'use client'

import { useEffect, useRef } from 'react'

import type { ChatMessage } from '@/hooks/use-copilot-chat'

import { MessageBubble } from './MessageBubble'

export function MessageList({
  messages,
  isAwaitingFirstToken,
  className,
}: {
  messages: ChatMessage[]
  isAwaitingFirstToken: boolean
  className?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the newest content while messages grow / stream.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isAwaitingFirstToken])

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
        <div ref={endRef} />
      </div>
    </div>
  )
}
