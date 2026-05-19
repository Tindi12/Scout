'use client'

import { ApplicationCreditsInfo } from '@/components/layout/ApplicationCreditsInfo'
import { useExploreBatchOptional } from '@/contexts/explore-batch-context'
import { creditsPeriodLabel } from '@/lib/subscription-plan'
import { cn } from '@/lib/utils'

type ApplicationCreditsMeterProps = {
  className?: string
}

export function ApplicationCreditsMeter({
  className,
}: ApplicationCreditsMeterProps) {
  const ctx = useExploreBatchOptional()
  const loading = ctx?.creditsLoading ?? true
  const credits = ctx?.credits

  const remaining = credits?.remaining
  const limit = credits?.limit
  const periodLabel = credits?.plan
    ? creditsPeriodLabel(credits.plan)
    : 'lifetime'

  return (
    <div
      className={cn(
        'glass-card w-full overflow-visible rounded-2xl border border-white/[0.06] px-4 py-3.5',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 flex-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.1em] text-[#666]">
          Application credits
        </p>
        <ApplicationCreditsInfo plan={credits?.plan ?? null} />
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-white/[0.06]" />
      ) : (
        <>
          <p className="mt-1.5 font-headline text-2xl font-medium tracking-tight">
            <span className="text-[#FF6733]">
              {remaining != null ? remaining : '—'}
            </span>
            <span className="text-[#444]"> / </span>
            <span className="text-[#888]">{limit != null ? limit : '—'}</span>
          </p>
          <p className="mt-1 font-body text-[10px] leading-snug text-[#555]">
            remaining {periodLabel}
          </p>
        </>
      )}
    </div>
  )
}
