'use client'

import { useUser } from '@clerk/nextjs'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, ExternalLink, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { ChatInput } from '@/components/copilot/ChatInput'
import { MessageList } from '@/components/copilot/MessageList'
import { useCopilotChat } from '@/hooks/use-copilot-chat'
import { MASCOT_ASSETS } from '@/lib/mascot'
import {
  isMascotGuideActive,
  subscribeMascotGuide,
} from '@/lib/mascot-presence'

/** Transparent pose assets — never use mascot-copilot.png (opaque black plate). */
const MASCOT_SRC = MASCOT_ASSETS.idle
const MASCOT_SIZE = 84

export function CopilotBubble() {
  const pathname = usePathname()
  const { user } = useUser()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [tipReady, setTipReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const guideActive = useSyncExternalStore(
    subscribeMascotGuide,
    isMascotGuideActive,
    () => false,
  )

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

  useEffect(() => {
    if (guideActive || pathname?.startsWith('/copilot')) {
      setTipReady(false)
      return
    }
    const delay = reduceMotion ? 0 : 450
    const t = window.setTimeout(() => setTipReady(true), delay)
    return () => window.clearTimeout(t)
  }, [guideActive, pathname, reduceMotion])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

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

  // Hide while a tour/nudge owns the corner, and on the full Copilot page.
  if (pathname?.startsWith('/copilot')) return null
  if (guideActive) return null

  const firstName =
    user?.firstName ?? user?.username ?? user?.fullName?.split(' ')[0] ?? 'there'

  const fullCopilotHref = conversationId
    ? `/copilot?c=${encodeURIComponent(conversationId)}`
    : '/copilot'

  const showTip = tipReady && !open

  return (
    <div
      ref={containerRef}
      className="fixed bottom-24 right-4 z-40 flex flex-col items-end md:bottom-5 md:right-5"
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mb-3 flex h-[28rem] max-h-[calc(100dvh-9rem)] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0c] shadow-[0_20px_60px_rgba(0,0,0,0.6)] md:max-h-[calc(100dvh-6rem)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Image
                  src={MASCOT_SRC}
                  alt=""
                  width={28}
                  height={28}
                  draggable={false}
                  className="h-7 w-7 select-none object-contain"
                />
                <span className="font-headline text-sm font-semibold text-white">
                  Scout
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
                  aria-label="Close Scout"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#888] transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                  <Image
                    src={MASCOT_SRC}
                    alt=""
                    width={64}
                    height={64}
                    draggable={false}
                    className="mb-3 h-16 w-16 select-none object-contain"
                  />
                  <p className="font-headline text-sm font-semibold text-white">
                    Ask me anything, {firstName}.
                  </p>
                  <p className="mt-1.5 font-label text-xs text-[#777]">
                    Resume gaps, role fit, what to apply to next. I&apos;m here.
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
                placeholder="Ask me anything…"
                autoFocus
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative flex h-[5.25rem] w-[5.25rem] items-center justify-center">
        <AnimatePresence>
          {showTip ? (
            <motion.button
              key="tip"
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Ask Scout anything"
              initial={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: 16, scaleX: 0.9 }
              }
              animate={{ opacity: 1, x: 0, scaleX: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: 12, scaleX: 0.92 }
              }
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              style={{ originX: 1 }}
              className="pointer-events-auto absolute right-[3.85rem] top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/[0.12] bg-[#0a0a0a]/92 px-3.5 py-2 font-label text-[12px] font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-sm transition-colors hover:border-white/[0.2] hover:bg-[#121212]"
            >
              Ask me anything
            </motion.button>
          ) : null}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close Scout' : 'Ask Scout anything'}
          aria-expanded={open}
          className="group relative z-20 flex h-[5.25rem] w-[5.25rem] items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF6733]/70"
        >
          <Image
            src={MASCOT_SRC}
            alt=""
            width={MASCOT_SIZE}
            height={MASCOT_SIZE}
            priority
            draggable={false}
            className="h-[5.25rem] w-[5.25rem] scale-[1.12] select-none object-contain transition-transform duration-300 group-hover:scale-[1.18] group-hover:-rotate-2"
          />
        </button>
      </div>
    </div>
  )
}
