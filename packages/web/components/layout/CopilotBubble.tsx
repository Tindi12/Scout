'use client'

import { useUser } from '@clerk/nextjs'
import { AlertCircle, ExternalLink, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ChatInput } from '@/components/copilot/ChatInput'
import { MessageList } from '@/components/copilot/MessageList'
import { useCopilotChat } from '@/hooks/use-copilot-chat'
import { scoutLogo } from '@/lib/scout-logo'

export function CopilotBubble() {
  const pathname = usePathname()
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    conversationId,
    isStreaming,
    isAwaitingFirstToken,
    error,
    limitInfo,
    sendMessage,
  } = useCopilotChat()

  const close = useCallback(() => setOpen(false), [])

  // Escape to dismiss.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // Click / tap outside to dismiss.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (containerRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open, close])

  // The full page is the richer surface — don't stack a mini copilot on top of it.
  if (pathname?.startsWith('/copilot')) return null

  const firstName =
    user?.firstName ?? user?.username ?? user?.fullName?.split(' ')[0] ?? 'there'

  const fullCopilotHref = conversationId
    ? `/copilot?c=${encodeURIComponent(conversationId)}`
    : '/copilot'

  return (
    <div
      ref={containerRef}
      className="fixed bottom-24 right-5 z-40 flex flex-col items-end md:bottom-6 md:right-6"
    >
      {open ? (
        <div className="mb-3 flex h-[28rem] max-h-[calc(100dvh-9rem)] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0c] shadow-[0_20px_60px_rgba(0,0,0,0.6)] md:max-h-[calc(100dvh-6rem)]">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04]">
                <Image
                  src={scoutLogo}
                  alt=""
                  width={16}
                  height={16}
                  draggable={false}
                  className="h-4 w-4 select-none object-contain"
                />
              </span>
              <span className="font-headline text-sm font-semibold text-white">
                Scout Copilot
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={fullCopilotHref}
                onClick={close}
                className="flex items-center gap-1 rounded-lg px-2 py-1 font-label text-[11px] font-medium text-[#888] transition-colors hover:text-[#FF6733]"
              >
                Open full Copilot
                <ExternalLink className="h-3 w-3" strokeWidth={2} />
              </Link>
              <button
                type="button"
                onClick={close}
                aria-label="Close copilot"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#888] transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-[#FF6733]/30 bg-[#FF6733]/10">
                  <Image
                    src={scoutLogo}
                    alt=""
                    width={20}
                    height={20}
                    draggable={false}
                    className="h-5 w-5 select-none object-contain"
                  />
                </span>
                <p className="font-headline text-sm font-semibold text-white">
                  Hey {firstName} — how can I help?
                </p>
                <p className="mt-1.5 font-label text-xs text-[#777]">
                  Ask about your pipeline, resume, or what to apply to next.
                </p>
              </div>
            ) : (
              <MessageList
                messages={messages}
                isAwaitingFirstToken={isAwaitingFirstToken}
                limitInfo={limitInfo}
              />
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/[0.06] p-3">
            {error ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
                <AlertCircle className="h-3 w-3 shrink-0" strokeWidth={2} />
                <span>{error}</span>
              </div>
            ) : null}
            <ChatInput
              onSend={(text) => void sendMessage(text)}
              disabled={isStreaming || limitInfo !== null}
              placeholder="Message Scout…"
              autoFocus
            />
          </div>
        </div>
      ) : null}

      {/* Floating launcher */}
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Scout copilot' : 'Ask Scout'}
        aria-expanded={open}
        className="group h-14 w-14 rounded-full"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 transition-transform duration-300 group-hover:rotate-[6deg]">
          <Image
            src={scoutLogo}
            alt=""
            width={28}
            height={28}
            draggable={false}
            className="h-7 w-7 select-none object-contain"
          />
        </span>
      </Button>
    </div>
  )
}
