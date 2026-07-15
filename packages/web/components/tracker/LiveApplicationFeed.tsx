'use client'

import { CheckCircle2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useNotificationsContext } from '@/contexts/notifications-context'

import {
  TooltipProvider,
} from '@/components/ui/tooltip'

import { PortalBadge } from './PortalBadge'
import { ApplicationOutcomeChip } from './ApplicationOutcomeChip'
import { RetryApplicationButton } from './RetryApplicationButton'
import {
  detectPortalFromUrl,
  formatElapsed,
  formatRelativeTime,
  isManualApplyRecommended,
  isRetryableApplication,
  mergeRunApplications,
  sortRunApplications,
  STATUS_CONFIG,
  TERMINAL_STATUSES,
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

// Only needs_attention is dismissible from the LIVE feed. 'failed' was dropped
// 2026-07-13: a card dismissed here (transient, "stop showing this in the
// running-now view") stayed dismissed via the SAME server-persisted flag the
// historical Kanban checks — but the Kanban never filters 'failed' by
// dismissal (failed cards always show, with a Retry action), so the two views
// disagreed. Concretely: retry a previously-dismissed failed application and
// watch it fail again live, and the feed would drop the row (and the whole
// section, if it's the only job in the run) instead of showing the failure —
// "moving to failed causes the card to disappear" rather than moving into a
// failed view. failed cards now always render here too, matching the Kanban.
const DISMISSIBLE_STATUSES = new Set<AppStatus>([
  'needs_attention',
])

type LiveApplicationFeedProps = {
  run: ScoutRun
  applicationRecords: ApplicationRecord[]
  onRetry?: (app: Pick<ApplicationRecord, 'id' | 'company'>) => Promise<void> | void
}

export function LiveApplicationFeed({
  run,
  applicationRecords,
  onRetry,
}: LiveApplicationFeedProps) {
  const { isApplicationDismissed, dismissForApplication } =
    useNotificationsContext()

  const apps = useMemo(() => {
    const merged = mergeRunApplications(run.applications, applicationRecords)
    return sortRunApplications(merged).filter((app) => {
      if (!DISMISSIBLE_STATUSES.has(app.status)) return true
      return !isApplicationDismissed(app.id)
    })
  }, [
    run.applications,
    applicationRecords,
    isApplicationDismissed,
  ])

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
              <FeedRow
                app={app}
                onRetry={onRetry}
                records={applicationRecords}
                onDismiss={
                  DISMISSIBLE_STATUSES.has(app.status)
                    ? () => void dismissForApplication(app.id)
                    : undefined
                }
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </section>
    </TooltipProvider>
  )
}

function FeedRow({
  app,
  onRetry,
  records,
  onDismiss,
}: {
  app: EnrichedRunApplication
  onRetry?: (app: Pick<ApplicationRecord, 'id' | 'company'>) => Promise<void> | void
  records: ApplicationRecord[]
  onDismiss?: () => void
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
        {isRetryableApplication({
          status: app.status,
          failure_code: (app as ApplicationRecord).failure_code ?? record?.failure_code,
          error_message: app.error_message ?? record?.error_message ?? null,
        }) && onRetry ? (
          <RetryApplicationButton
            className="h-7 w-7"
            onRetry={() => onRetry({ id: app.id, company: app.company })}
          />
        ) : null}
        {viewUrl ? (
          isManualApplyRecommended({
            status: app.status,
            failure_code:
              (app as ApplicationRecord).failure_code ?? record?.failure_code,
            error_message: app.error_message ?? record?.error_message ?? null,
          }) ? (
            // Spam/CAPTCHA block: automation is terminal here, but a human
            // applying on the job page works — make that the primary action.
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-label text-xs font-medium text-[#f59e0b] transition-colors hover:text-[#fbbf24]"
            >
              Apply manually →
            </a>
          ) : (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-label text-xs text-[#888] transition-colors hover:text-white"
            >
              View →
            </a>
          )
        ) : (
          <span className="font-label text-xs text-[#333]">View →</span>
        )}
        {onDismiss ? (
          <button
            type="button"
            aria-label="Dismiss from feed"
            onClick={onDismiss}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#555] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
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
      <span className="inline-flex items-center justify-end gap-1.5 font-label text-xs text-[#22c55e]">
        <CheckCircle2 className="h-3 w-3 shrink-0" strokeWidth={2} />
        Applied {formatRelativeTime(app.applied_at)}
      </span>
    )
  }
  if (app.status === 'in_progress') {
    return <InProgressTimer appId={app.id} />
  }
  if (app.status === 'failed') {
    return (
      <div className="flex justify-end">
        <ApplicationOutcomeChip
          app={{
            id: app.id,
            status: app.status,
            error_message: app.error_message,
            company: app.company,
            role: app.role,
          }}
          className="mt-0"
        />
      </div>
    )
  }
  if (app.status === 'queued') {
    return <span className="font-mono text-xs text-[#444]">Waiting...</span>
  }
  if (app.status === 'needs_attention') {
    // Informational only (2026-07-13: needs_attention no longer asks the user to
    // type an answer) — same chip 'failed' uses above, showing the ALREADY
    // user-safe message directly with no fetch.
    return (
      <div className="flex justify-end">
        <ApplicationOutcomeChip
          app={{
            id: app.id,
            status: app.status,
            error_message: app.error_message,
            company: app.company,
            role: app.role,
          }}
          className="mt-0"
        />
      </div>
    )
  }
  // awaiting_code: Scout retrieves the emailed code itself — render as an
  // active verifying step, never a user prompt.
  if (app.status === 'awaiting_code') {
    return (
      <span className="font-mono text-xs text-[#22d3ee]">Verifying…</span>
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
