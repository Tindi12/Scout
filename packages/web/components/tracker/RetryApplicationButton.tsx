'use client'

import { RotateCw } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Circular retry affordance shown on every failed application card. The parent
 * owns the actual retry call; this only guards double-clicks and spins while
 * the retry is in flight.
 */
export function RetryApplicationButton({
  onRetry,
  className,
}: {
  onRetry: () => Promise<void> | void
  className?: string
}) {
  const [pending, setPending] = useState(false)

  return (
    <button
      type="button"
      aria-label="Retry this application"
      title="Retry this application"
      disabled={pending}
      onClick={async (event) => {
        event.stopPropagation()
        if (pending) return
        setPending(true)
        try {
          await onRetry()
        } finally {
          setPending(false)
        }
      }}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#888] transition-colors hover:border-[#FF6733]/40 hover:bg-[#FF6733]/10 hover:text-[#FF6733] disabled:cursor-wait disabled:opacity-60',
        className,
      )}
    >
      <RotateCw
        className={cn('h-3 w-3', pending && 'animate-spin')}
        strokeWidth={2}
      />
    </button>
  )
}
