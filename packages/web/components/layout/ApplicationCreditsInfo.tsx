'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PlanBadge } from '@/components/billing/PlanBadge'
import {
  FREE_APPLICATION_LIMIT,
  PRO_APPLICATION_LIMIT,
  SCOUT_PLUS_APPLICATION_LIMIT,
  creditsPeriodLabel,
  planDisplayLabel,
  type SubscriptionPlan,
} from '@/lib/subscription-plan'
import { cn } from '@/lib/utils'

type ApplicationCreditsInfoProps = {
  plan?: SubscriptionPlan | null
  className?: string
}

const PLAN_ROWS: ReadonlyArray<{
  plan: SubscriptionPlan
  limit: number
}> = [
  { plan: 'free', limit: FREE_APPLICATION_LIMIT },
  { plan: 'pro', limit: PRO_APPLICATION_LIMIT },
  { plan: 'scout_plus', limit: SCOUT_PLUS_APPLICATION_LIMIT },
]

function CreditsInfoPanel({ plan }: { plan?: SubscriptionPlan | null }) {
  return (
    <>
      <p className="font-label text-xs font-semibold text-white">
        How credits work
      </p>
      <p className="mt-2 font-body text-xs leading-relaxed text-[#aaa]">
        Each credit equals one application when you{' '}
        <span className="text-[#ccc]">Send Scout</span> to a job. Credits go
        down by the number of roles you queue in a batch.
      </p>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#666]">
        Plan limits
      </p>
      <ul className="mt-2 space-y-2">
        {PLAN_ROWS.map((row) => {
          const isCurrent = plan === row.plan
          return (
            <li
              key={row.plan}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs',
                isCurrent && 'bg-white/[0.04] ring-1 ring-white/[0.08]',
              )}
            >
              <PlanBadge plan={row.plan} />
              <span className="font-body tabular-nums text-[#ccc]">
                {row.limit}{' '}
                <span className="text-[#666]">
                  {creditsPeriodLabel(row.plan)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 border-t border-white/[0.06] pt-2 font-body text-xs leading-relaxed text-[#aaa]">
        <span className="font-semibold text-[#ccc]">
          Failed applications do not cost you credits.
        </span>{' '}
        If an application fails, your credits are automatically refunded and
        you can retry the application anytime. Credits are only used when
        Scout successfully begins a new application attempt.
      </p>

      <p className="mt-3 border-t border-white/[0.06] pt-2 font-body text-[10px] leading-relaxed text-[#666]">
        Paid plans reset each billing period. Free credits are lifetime and do
        not renew.
      </p>
    </>
  )
}

export function ApplicationCreditsInfo({
  plan,
  className,
}: ApplicationCreditsInfoProps) {
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
            aria-label="How application credits work"
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
          <CreditsInfoPanel plan={plan} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
