'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'
import { useState } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type NeedsAttentionInfoProps = {
  className?: string
}

export function NeedsAttentionInfo({ className }: NeedsAttentionInfoProps) {
  const [open, setOpen] = useState(false)

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full text-[#555] transition-colors hover:bg-white/[0.06] hover:text-[#999] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6733]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]',
              className,
            )}
            aria-label="What needs attention means"
            onClick={(event) => {
              event.preventDefault()
              setOpen((value) => !value)
            }}
          >
            <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={16}
          className="z-[100] w-[min(calc(100vw-2rem),280px)] border border-white/10 bg-[#111111] p-4 text-left shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          <p className="font-label text-xs font-semibold text-white">
            Needs attention
          </p>
          <p className="mt-2 font-body text-xs leading-relaxed text-[#aaa]">
            Applications waiting on you — verification codes, manual form
            steps, or fixes Scout could not finish automatically.
          </p>
          <Link
            href="/tracker"
            className="mt-3 inline-flex items-center gap-1 font-label text-xs font-medium text-[#FF6733] transition-colors hover:text-[#ff8555]"
            onClick={() => setOpen(false)}
          >
            Open tracker
          </Link>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
