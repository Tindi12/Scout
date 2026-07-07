'use client'

import { CheckCircle2, CircleSlash, Info } from 'lucide-react'
import { useCallback, useState } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  failureShortLabel,
  isCancelledByUser,
  type ApplicationRecord,
} from './tracker-utils'

type FailureSummary = {
  kind: 'failed' | 'cancelled'
  summary: string
}

const SUMMARY_CACHE_VERSION = 'v2'

const summaryCache = new Map<string, FailureSummary>()

async function fetchFailureSummary(appId: string): Promise<FailureSummary> {
  const cacheKey = `${SUMMARY_CACHE_VERSION}:${appId}`
  const cached = summaryCache.get(cacheKey)
  if (cached) return cached

  const res = await fetch(
    `/api/applications/${encodeURIComponent(appId)}/failure-summary`,
  )
  if (!res.ok) {
    throw new Error('summary_fetch_failed')
  }
  const data = (await res.json()) as FailureSummary
  summaryCache.set(cacheKey, data)
  return data
}

type ApplicationOutcomeChipProps = {
  app: Pick<ApplicationRecord, 'id' | 'status' | 'error_message' | 'company' | 'role'>
  className?: string
}

export function ApplicationOutcomeChip({
  app,
  className,
}: ApplicationOutcomeChipProps) {
  if (app.status === 'applied') {
    return (
      <p
        className={[
          'mt-1.5 inline-flex items-center gap-1.5 font-label text-[10px] font-medium text-[#22c55e]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={2} />
        Applied successfully
      </p>
    )
  }

  if (app.status !== 'failed' || !app.error_message) return null

  return (
    <OutcomeSummaryChip
      app={app}
      className={className}
      errorMessage={app.error_message}
      tone={isCancelledByUser(app.error_message) ? 'cancelled' : 'failed'}
    />
  )
}

/** Per-tone styling; both tones share the same fetch/tooltip mechanics. */
const TONES = {
  failed: {
    Icon: Info,
    chip: 'border-[#ef4444]/20 bg-[#ef4444]/[0.06] text-[#ef4444] hover:border-[#ef4444]/30 hover:bg-[#ef4444]/10',
    heading: 'text-[#ef4444]',
    fallbackSummary:
      "Scout couldn't complete this application. Try again, or check your resume and Scout settings if it keeps failing.",
  },
  cancelled: {
    Icon: CircleSlash,
    chip: 'border-white/[0.08] bg-white/[0.04] text-[#888] hover:border-white/15 hover:bg-white/[0.06] hover:text-[#aaa]',
    heading: 'text-[#a1a1aa]',
    fallbackSummary: 'You stopped this application before Scout could finish.',
  },
} as const

function OutcomeSummaryChip({
  app,
  className,
  errorMessage,
  tone,
}: {
  app: ApplicationOutcomeChipProps['app']
  className?: string
  errorMessage: string
  tone: 'failed' | 'cancelled'
}) {
  const [summary, setSummary] = useState<FailureSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const { Icon, chip, heading, fallbackSummary } = TONES[tone]
  const label =
    tone === 'cancelled'
      ? 'Cancelled by you'
      : `Failed · ${failureShortLabel(errorMessage)}`

  const loadSummary = useCallback(async () => {
    if (summary || loading) return
    setLoading(true)
    try {
      const data = await fetchFailureSummary(app.id)
      setSummary(data)
    } catch {
      setSummary({ kind: tone, summary: fallbackSummary })
    } finally {
      setLoading(false)
    }
  }, [app.id, fallbackSummary, loading, summary, tone])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) void loadSummary()
    },
    [loadSummary],
  )

  return (
    <Tooltip onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={[
            'mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 font-label text-[10px] font-medium transition-colors',
            chip,
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Icon className="h-3 w-3 shrink-0" strokeWidth={2} />
          <span className="truncate">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        sideOffset={6}
        className="pointer-events-auto max-w-[min(18rem,90vw)] border border-white/[0.08] bg-[#0c0c0c] p-0 text-white shadow-xl"
      >
        <div className="p-3">
          <p className={`font-label text-[11px] font-semibold ${heading}`}>
            What happened
          </p>
          {loading ? (
            <p className="mt-2 font-label text-[11px] leading-relaxed text-[#888]">
              Figuring out what went wrong…
            </p>
          ) : (
            <p className="mt-2 font-label text-[11px] leading-relaxed text-[#ccc]">
              {summary?.summary ?? 'Hover to see what happened.'}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
