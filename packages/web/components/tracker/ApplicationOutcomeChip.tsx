'use client'

import { CheckCircle2, CircleSlash, Info } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

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

const SUMMARY_CACHE_VERSION = 'v3'

const summaryCache = new Map<string, FailureSummary>()

async function fetchFailureSummary(
  appId: string,
  errorMessage: string,
): Promise<FailureSummary> {
  // Key on the error too: a retried application can fail again with a
  // different error, and must not serve the previous attempt's summary.
  const cacheKey = `${SUMMARY_CACHE_VERSION}:${appId}:${errorMessage.slice(0, 80)}`
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

  // needs_attention cards are purely informational (2026-07-13: the prior
  // "Answer Required" flow made typing a free-text answer a prerequisite,
  // which contradicted Scout's autonomous-agent premise). error_message here is
  // ALREADY the polished, user-safe attention_question written by
  // services/browser_agent.py's _interpret_agent_result — unlike a failed row's
  // error_message (a raw technical string), it needs no AI summarization and no
  // hover-to-fetch: show it directly.
  if (app.status === 'needs_attention') {
    if (!app.error_message) return null
    return (
      <p
        className={[
          'mt-1.5 flex items-start gap-1.5 font-label text-[10px] leading-relaxed text-[#f59e0b]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
        <span>{app.error_message}</span>
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
      'We ran into an unexpected issue while submitting this application. Retrying usually resolves this.',
  },
  cancelled: {
    Icon: CircleSlash,
    chip: 'border-white/[0.08] bg-white/[0.04] text-[#888] hover:border-white/15 hover:bg-white/[0.06] hover:text-[#aaa]',
    heading: 'text-[#a1a1aa]',
    fallbackSummary: 'You stopped this application before Scout could finish.',
  },
} as const

/**
 * "Figuring out what went wrong" with trailing dots that cycle
 * . → .. → ... → (none) while the summary loads. The dot slot has a fixed
 * width so the text never shifts as the dots change.
 */
function AnalyzingIndicator() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), 400)
    return () => clearInterval(id)
  }, [])

  const dots = ['.', '..', '...', ''][frame]

  return (
    <p className="mt-2 font-label text-[11px] leading-relaxed text-[#888]">
      Figuring out what went wrong
      <span aria-hidden className="inline-block w-4 text-left">
        {dots}
      </span>
    </p>
  )
}

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
      const data = await fetchFailureSummary(app.id, errorMessage)
      setSummary(data)
    } catch {
      setSummary({ kind: tone, summary: fallbackSummary })
    } finally {
      setLoading(false)
    }
  }, [app.id, errorMessage, fallbackSummary, loading, summary, tone])

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
            <AnalyzingIndicator />
          ) : (
            <>
              <p className="mt-2 font-label text-[11px] leading-relaxed text-[#ccc]">
                {summary?.summary ?? 'Hover to see what happened.'}
              </p>
              <p className="mt-2 font-label text-[10px] leading-relaxed text-[#22c55e]/80">
                Your credit for this application was automatically refunded —
                retry anytime.
              </p>
              {tone === 'failed' ? (
                <p className="mt-2 border-t border-white/[0.06] pt-2 font-label text-[10px] leading-relaxed text-[#666]">
                  All application failures are automatically reported to the
                  Scout team. If you&apos;d like to help us investigate
                  further, you can also report this issue to{' '}
                  <a
                    href="mailto:tindi@scoutintern.com"
                    className="text-[#999] underline decoration-white/20 underline-offset-2 transition-colors hover:text-white"
                  >
                    tindi@scoutintern.com
                  </a>
                  .
                </p>
              ) : null}
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
