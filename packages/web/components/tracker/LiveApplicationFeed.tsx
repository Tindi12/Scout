'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { PortalBadge } from './PortalBadge'
import {
  detectPortalFromUrl,
  formatElapsed,
  formatRelativeTime,
  mergeRunApplications,
  sortRunApplications,
  STATUS_CONFIG,
  TERMINAL_STATUSES,
  truncateError,
  type ApplicationRecord,
  type AppStatus,
  type EnrichedRunApplication,
  type ScoutRun,
} from './tracker-utils'

// The applications table has no updated_at / status_changed_at column, so the
// elapsed timer has no server-side anchor — anchoring to component mount made it
// reset on every page switch. Instead the first render that sees an app actively
// applying stores a start time in localStorage; the anchor survives navigation
// and reloads, and is cleared once the app reaches a terminal status. Anchors
// older than the stale cutoff (a run that died without cleanup) restart fresh.
const TIMER_KEY_PREFIX = 'scout:applying-since:'
const TIMER_STALE_MS = 30 * 60_000

function activeTimerStart(appId: string): number {
  const key = TIMER_KEY_PREFIX + appId
  const now = Date.now()
  try {
    const stored = Number(window.localStorage.getItem(key))
    if (Number.isFinite(stored) && stored > 0 && stored <= now && now - stored < TIMER_STALE_MS) {
      return stored
    }
    window.localStorage.setItem(key, String(now))
  } catch {
    // Storage unavailable (private mode etc.) — fall back to mount time.
  }
  return now
}

function clearTimerStart(appId: string) {
  try {
    window.localStorage.removeItem(TIMER_KEY_PREFIX + appId)
  } catch {
    // ignore
  }
}

type LiveApplicationFeedProps = {
  run: ScoutRun
  applicationRecords: ApplicationRecord[]
  onAnswerClick: (app: ApplicationRecord) => void
  onCodeClick: (app: ApplicationRecord) => void
}

export function LiveApplicationFeed({
  run,
  applicationRecords,
  onAnswerClick,
  onCodeClick,
}: LiveApplicationFeedProps) {
  const apps = useMemo(() => {
    const merged = mergeRunApplications(run.applications, applicationRecords)
    return sortRunApplications(merged)
  }, [run.applications, applicationRecords])

  if (apps.length === 0) return null

  return (
    <TooltipProvider delayDuration={200}>
      <section className="-mx-5 border-b border-white/[0.04] md:-mx-8">
        <AnimatePresence initial={false}>
          {apps.map((app, index) => (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: index * 0.05 }}
            >
              <FeedRow app={app} onAnswerClick={onAnswerClick} onCodeClick={onCodeClick} records={applicationRecords} />
            </motion.div>
          ))}
        </AnimatePresence>
      </section>
    </TooltipProvider>
  )
}

function FeedRow({
  app,
  onAnswerClick,
  onCodeClick,
  records,
}: {
  app: EnrichedRunApplication
  onAnswerClick: (app: ApplicationRecord) => void
  onCodeClick: (app: ApplicationRecord) => void
  records: ApplicationRecord[]
}) {
  // Defensive fallback: app.status is normalized upstream, but a config miss here
  // (e.g. a hot-reload race between bundle versions) must not crash the tracker.
  const config = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.queued
  const portal = detectPortalFromUrl(app.job_url)
  const record = records.find((r) => r.id === app.id)

  useEffect(() => {
    if (TERMINAL_STATUSES.has(app.status)) clearTimerStart(app.id)
  }, [app.status, app.id])

  const viewUrl = app.job_url || app.url || record?.job_url

  // The records list can lag a poll cycle behind run status; never let that hide
  // the time-sensitive code prompt — synthesize a record from the run app instead.
  const recordForModal: ApplicationRecord = record ?? {
    id: app.id,
    job_id: app.job_id,
    status: app.status,
    company: app.company,
    role: app.role,
    job_url: app.job_url,
    error_message: app.error_message,
    applied_at: app.applied_at,
  }

  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.04] px-8 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-[100px] items-center gap-2.5">
        <StatusDot status={app.status} color={config.color} />
        <span
          className="font-mono text-[10px] tracking-wider"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      </div>

      <div className="min-w-0 flex-1 sm:max-w-[40%]">
        <p className="truncate text-sm font-medium text-white">
          {app.company || 'Unknown company'}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="truncate text-xs text-[#555]">{app.role || 'Role'}</p>
          <PortalBadge portal={portal} />
        </div>
      </div>

      <div className="min-w-0 flex-1 text-xs sm:text-right">
        <TimingColumn app={app} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {app.status === 'awaiting_code' ? (
          <button
            type="button"
            onClick={() => onCodeClick(recordForModal)}
            className="inline-flex h-7 items-center rounded-full border border-[#22d3ee]/30 bg-[#22d3ee]/10 px-3 font-label text-[11px] font-semibold text-[#22d3ee] transition-colors hover:bg-[#22d3ee]/20"
          >
            Enter Code
          </button>
        ) : null}
        {app.status === 'needs_attention' && record ? (
          <button
            type="button"
            onClick={() => onAnswerClick(record)}
            className="inline-flex h-7 items-center rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 font-label text-[11px] font-semibold text-[#f59e0b] transition-colors hover:bg-[#f59e0b]/20"
          >
            Answer
          </button>
        ) : null}
        {viewUrl ? (
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-label text-xs text-[#888] transition-colors hover:text-white"
          >
            View →
          </a>
        ) : (
          <span className="font-label text-xs text-[#333]">View →</span>
        )}
      </div>
    </div>
  )
}

function StatusDot({ status, color }: { status: AppStatus; color: string }) {
  if (status === 'in_progress' || status === 'awaiting_code') {
    return (
      <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
          style={{ backgroundColor: `${color}4D` }}
        />
        <span
          className="relative h-3 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
      </span>
    )
  }
  return (
    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
  )
}

function TimingColumn({ app }: { app: EnrichedRunApplication }) {
  if (app.status === 'applied' && app.applied_at) {
    return (
      <span className="font-mono text-xs text-[#22c55e]">
        Applied {formatRelativeTime(app.applied_at)}
      </span>
    )
  }
  if (app.status === 'in_progress') {
    return <InProgressTimer appId={app.id} />
  }
  if (app.status === 'failed' && app.error_message) {
    const short = truncateError(app.error_message, 40)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default font-mono text-xs text-[#ef4444]">
            Failed · {short}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-sm border border-white/[0.08] bg-[#0a0a0a] text-xs text-white"
        >
          {app.error_message}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (app.status === 'queued') {
    return <span className="font-mono text-xs text-[#444]">Waiting...</span>
  }
  if (app.status === 'needs_attention') {
    return <span className="font-mono text-xs text-[#f59e0b]">Input required</span>
  }
  if (app.status === 'awaiting_code') {
    return (
      <span className="font-mono text-xs text-[#22d3ee]">
        Check your email for a code
      </span>
    )
  }
  return null
}

function InProgressTimer({ appId }: { appId: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = activeTimerStart(appId)
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [appId])

  return (
    <span className="font-mono text-xs text-[#FF6733]">{formatElapsed(elapsed)}</span>
  )
}

export function LiveApplicationFeedSkeleton() {
  return (
    <section className="-mx-5 border-b border-white/[0.04] md:-mx-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse gap-4 border-b border-white/[0.04] px-8 py-4"
        >
          <div className="h-3 w-3 rounded-full bg-white/[0.05]" />
          <div className="h-4 flex-1 rounded bg-white/[0.05]" />
          <div className="h-4 w-24 rounded bg-white/[0.04]" />
        </div>
      ))}
    </section>
  )
}
