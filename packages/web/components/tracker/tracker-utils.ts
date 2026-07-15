'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

export type AppStatus =
  | 'queued'
  | 'in_progress'
  | 'awaiting_code'
  | 'applied'
  | 'failed'
  | 'needs_attention'

export type RunApplication = {
  id: string
  job_id: string
  company: string
  role: string
  url?: string
  status: AppStatus
  error_message: string | null
  applied_at: string | null
  updated_at?: string | null
}

export type ScoutRun = {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_jobs: number
  applied_count: number
  failed_count: number
  needs_attention_count: number
  created_at: string
  applications: RunApplication[]
}

export type ApplicationRecord = {
  id: string
  job_id: string
  scout_run_id?: string | null
  status: string | null
  company: string
  role: string
  job_url: string
  error_message: string | null
  /** Machine reason derived server-side (e.g. spam_blocked). Not user-facing. */
  failure_code?: string | null
  applied_at: string | null
  created_at?: string | null
  updated_at?: string | null
  /**
   * created_at of this application's most recent notification event, i.e. the
   * true "last changed" time. applications.created_at is frozen at the row's
   * ORIGINAL creation and does NOT move when a retry/re-queue reuses the same
   * row for a new attempt (new scout_run_id, new status, same id) — displaying
   * it as "how long ago" for a retried application shows a stale date. Prefer
   * this field; fall back to created_at only when it's absent (e.g. an app that
   * has never had a terminal transition yet). See GET /api/applications.
   */
  status_changed_at?: string | null
}

/**
 * The scout_run_id of any application that is still actively being worked
 * (queued / in_progress / awaiting_code). Lets the tracker find the ongoing run
 * with no ?run_id= in the URL and nothing in sessionStorage — e.g. a brand-new
 * tab opened mid-run.
 */
export function activeRunIdFromApps(apps: ApplicationRecord[]): string | null {
  const active = apps.find(
    (a) =>
      (a.status === 'in_progress' ||
        a.status === 'awaiting_code' ||
        a.status === 'queued') &&
      a.scout_run_id,
  )
  return active?.scout_run_id ?? null
}

export const TERMINAL_STATUSES = new Set<AppStatus>([
  'applied',
  'failed',
  'needs_attention',
])

const KNOWN_APP_STATUSES = new Set<string>([
  'queued',
  'in_progress',
  'awaiting_code',
  'applied',
  'failed',
  'needs_attention',
])

/**
 * Runtime guard for statuses coming off the API. The DB column is unconstrained
 * text, so a bare `as AppStatus` cast lets unknown values straight into
 * STATUS_CONFIG lookups — `undefined.color` then crashes the whole tracker
 * (seen live when an old bundle met the then-new 'awaiting_code'). Anything
 * unrecognized renders as queued instead of throwing.
 */
export function normalizeAppStatus(status: string | null | undefined): AppStatus {
  return status && KNOWN_APP_STATUSES.has(status) ? (status as AppStatus) : 'queued'
}

export const STATUS_ORDER: Record<AppStatus, number> = {
  awaiting_code: 0,
  in_progress: 1,
  queued: 2,
  needs_attention: 3,
  applied: 4,
  failed: 5,
}

export const STATUS_CONFIG: Record<
  AppStatus,
  { color: string; label: string; columnColor: string }
> = {
  queued: { color: '#444', label: 'QUEUED', columnColor: '#444' },
  in_progress: { color: '#FF6733', label: 'APPLYING', columnColor: '#FF6733' },
  // awaiting_code is agent-internal (Scout retrieves the emailed code itself);
  // render it as a normal verifying step, never as a user action.
  awaiting_code: { color: '#22d3ee', label: 'VERIFYING', columnColor: '#22d3ee' },
  applied: { color: '#22c55e', label: 'APPLIED', columnColor: '#22c55e' },
  failed: { color: '#ef4444', label: 'FAILED', columnColor: '#ef4444' },
  needs_attention: {
    color: '#f59e0b',
    label: 'ATTENTION',
    columnColor: '#f59e0b',
  },
}

export type PortalType =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'smartrecruiters'
  | 'workable'
  | 'recruitee'
  | 'bamboohr'
  | 'teamtailor'
  | 'icims'
  | 'unknown'

export const PORTAL_META: Record<
  Exclude<PortalType, 'unknown'>,
  { label: string; classes: string }
> = {
  greenhouse: {
    label: 'Greenhouse',
    classes: 'bg-[#22c55e]/10 text-[#22c55e]',
  },
  lever: {
    label: 'Lever',
    classes: 'bg-[#3b82f6]/10 text-[#3b82f6]',
  },
  ashby: {
    label: 'Ashby',
    classes: 'bg-purple-500/10 text-purple-400',
  },
  workday: {
    label: 'Workday',
    classes: 'bg-white/[0.06] text-[#888]',
  },
  smartrecruiters: {
    label: 'SmartRecruiters',
    classes: 'bg-sky-500/10 text-sky-400',
  },
  workable: {
    label: 'Workable',
    classes: 'bg-orange-500/10 text-orange-400',
  },
  recruitee: {
    label: 'Recruitee',
    classes: 'bg-teal-500/10 text-teal-400',
  },
  bamboohr: {
    label: 'BambooHR',
    classes: 'bg-emerald-500/10 text-emerald-400',
  },
  teamtailor: {
    label: 'Teamtailor',
    classes: 'bg-fuchsia-500/10 text-fuchsia-400',
  },
  icims: {
    label: 'iCIMS',
    classes: 'bg-cyan-500/10 text-cyan-400',
  },
}

export function isCancelledByUser(
  errorMessage: string | null | undefined,
): boolean {
  const value = (errorMessage ?? '').trim()
  return value === 'cancelled_by_user' || value.startsWith('cancelled_by_user')
}

/** Failure codes that must not re-enter Scout's automatic apply flow. */
const NON_RETRYABLE_FAILURE_CODES = new Set(['spam_blocked', 'captcha_detected'])

/**
 * Whether the tracker should offer Retry for this application. Spam/CAPTCHA
 * blocks reinforce the ATS verdict when re-automated — apply manually instead.
 */
export function isRetryableApplication(
  app: Pick<ApplicationRecord, 'status' | 'failure_code' | 'error_message'>,
): boolean {
  if (app.status !== 'failed' && app.status !== 'needs_attention') return false
  const code = (app.failure_code || '').trim().toLowerCase()
  if (code && NON_RETRYABLE_FAILURE_CODES.has(code)) return false
  // Belt-and-suspenders for older rows that lack failure_code but carry spam text.
  const msg = (app.error_message || '').toLowerCase()
  if (msg.includes('possible spam') || msg.includes('spam and refused')) return false
  if (msg.includes('captcha verification required')) return false
  return true
}

/**
 * Whether the tracker should show an "Apply manually" link instead of Retry.
 * True exactly for spam/CAPTCHA-blocked terminal applications: re-automating
 * them reinforces the ATS verdict, but a human applying on the job page works.
 */
export function isManualApplyRecommended(
  app: Pick<ApplicationRecord, 'status' | 'failure_code' | 'error_message'>,
): boolean {
  if (app.status !== 'failed' && app.status !== 'needs_attention') return false
  const code = (app.failure_code || '').trim().toLowerCase()
  if (code && NON_RETRYABLE_FAILURE_CODES.has(code)) return true
  const msg = (app.error_message || '').toLowerCase()
  if (msg.includes('possible spam') || msg.includes('spam and refused')) return true
  if (msg.includes('captcha verification required')) return true
  return false
}

// Short, strictly user-facing chip labels — never surface internal mechanics
// (vendors, sessions, timeouts). The hover summary carries the full story.
export function failureShortLabel(errorMessage: string): string {
  if (isCancelledByUser(errorMessage)) return 'Cancelled'
  const lower = errorMessage.toLowerCase()
  if (lower.includes('pdflatex')) return 'Resume issue'
  if (lower.includes('missing_required_document')) return 'Document needed'
  if (lower.includes('spam')) return 'Spam blocked'
  if (lower.includes('service limit') || lower.includes('browserbase')) {
    return 'Temporary issue'
  }
  if (lower.includes('browser_session') || lower.includes('planner_deadlock')) {
    return 'Interrupted'
  }
  if (lower.includes('verification') || lower.includes('captcha')) {
    return 'Verification needed'
  }
  return 'See details'
}

export function isRunComplete(run: ScoutRun): boolean {
  if (run.status === 'completed') return true
  return (
    run.applications.length > 0 &&
    run.applications.every((a) => TERMINAL_STATUSES.has(a.status))
  )
}

export function isRunRunning(run: ScoutRun): boolean {
  return run.status === 'pending' || run.status === 'running'
}

export type RunStatusCounts = {
  applied: number
  failed: number
  attention: number
}

/**
 * Header counts derived from the actual application rows. The scout_runs
 * counter columns (applied_count etc.) are bumped by RPC calls that several
 * failure paths never make (cancellations, kill artifacts, backfills), so they
 * can read 0 while the kanban — which counts rows — shows the truth. Always
 * derive from rows; fall back to the stored counters only when the payload has
 * no applications attached. awaiting_code is NOT attention — Scout retrieves
 * the code itself; it renders as an active verifying step.
 */
export function runStatusCounts(run: ScoutRun): RunStatusCounts {
  if (run.applications.length === 0) {
    return {
      applied: run.applied_count ?? 0,
      failed: run.failed_count ?? 0,
      attention: run.needs_attention_count ?? 0,
    }
  }
  let applied = 0
  let failed = 0
  let attention = 0
  for (const a of run.applications) {
    if (a.status === 'applied') applied += 1
    else if (a.status === 'failed') failed += 1
    else if (a.status === 'needs_attention') attention += 1
  }
  return { applied, failed, attention }
}

export function progressPct(run: ScoutRun): number {
  const total = run.total_jobs ?? 0
  if (total <= 0) return 0
  const done =
    run.applications.length > 0
      ? run.applications.filter((a) => TERMINAL_STATUSES.has(a.status)).length
      : (run.applied_count ?? 0) +
        (run.failed_count ?? 0) +
        (run.needs_attention_count ?? 0)
  return Math.round((done / total) * 100)
}

export type LifetimeOverviewStats = {
  applied: number
  failed: number
  needsAttention: number
  progressPct: number
  showProgress: boolean
}

export function lifetimeStatsFromApps(
  apps: ApplicationRecord[],
  /**
   * Same dismissal predicate the kanban uses to drop X-ed attention cards.
   * Without it the header ATTENTION stat counts rows the board no longer
   * shows — a phantom "1 needs attention" over zero visible cards.
   */
  isApplicationDismissed?: (applicationId: string) => boolean,
): LifetimeOverviewStats {
  const applied = apps.filter((a) => a.status === 'applied').length
  const failed = apps.filter((a) => a.status === 'failed').length
  // awaiting_code is deliberately excluded — Scout handles the code itself,
  // so it renders as an active verifying step, not attention.
  const needsAttention = apps.filter(
    (a) =>
      a.status === 'needs_attention' &&
      !(isApplicationDismissed && isApplicationDismissed(a.id)),
  ).length
  const terminal = applied + failed + needsAttention
  const progressPct =
    terminal > 0 ? Math.round((applied / terminal) * 100) : 0
  return {
    applied,
    failed,
    needsAttention,
    progressPct,
    showProgress: terminal > 0,
  }
}

export function getRunTitle(run: ScoutRun): string {
  if (isRunRunning(run)) return 'Scout is applying...'
  if (isRunComplete(run)) {
    const allFailed =
      run.applications.length > 0 &&
      run.applications.every((a) => a.status === 'failed')
    if (allFailed) return 'Run failed'
    return 'Run complete'
  }
  return 'Scout is applying...'
}

export function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diff = Math.max(0, now - then)
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  } catch {
    return 'recently'
  }
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function detectPortalFromUrl(url: string): PortalType {
  const lower = (url ?? '').toLowerCase()
  if (lower.includes('greenhouse.io')) return 'greenhouse'
  if (lower.includes('lever.co')) return 'lever'
  if (lower.includes('ashbyhq.com')) return 'ashby'
  if (lower.includes('myworkdayjobs.com')) return 'workday'
  if (lower.includes('smartrecruiters.com')) return 'smartrecruiters'
  if (lower.includes('workable.com')) return 'workable'
  if (lower.includes('recruitee.com')) return 'recruitee'
  if (lower.includes('bamboohr.com')) return 'bamboohr'
  if (lower.includes('teamtailor.com')) return 'teamtailor'
  if (lower.includes('icims.com')) return 'icims'
  return 'unknown'
}

export function truncateError(msg: string, max = 40): string {
  if (msg.length <= max) return msg
  return `${msg.slice(0, max)}…`
}

export type EnrichedRunApplication = RunApplication & {
  job_url: string
  updated_at: string | null
}

export function sortRunApplications<T extends RunApplication>(apps: T[]): T[] {
  return [...apps].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  )
}

export function mergeRunApplications(
  runApps: RunApplication[],
  records: ApplicationRecord[],
): EnrichedRunApplication[] {
  const byId = new Map(records.map((r) => [r.id, r]))
  return runApps.map((app) => {
    const rec = byId.get(app.id)
    const jobUrl = rec?.job_url || app.url || ''
    return {
      ...app,
      job_url: jobUrl,
      updated_at: rec?.updated_at ?? app.updated_at ?? null,
    }
  })
}

export function useScoutRun(runId: string | null, onRunUpdated?: () => void) {
  const [run, setRun] = useState<ScoutRun | null>(null)
  const [loading, setLoading] = useState(Boolean(runId))
  const runRef = useRef<ScoutRun | null>(null)

  useEffect(() => {
    if (!runId) {
      setRun(null)
      setLoading(false)
      return
    }

    let stopped = false
    setLoading(true)

    const fetchRun = async () => {
      if (stopped) return
      try {
        const res = await fetch(`/api/scout/status/${runId}`, { cache: 'no-store' })
        if (stopped || !res.ok) return
        const data = (await res.json()) as ScoutRun & {
          applications?: Array<RunApplication & { url?: string }>
        }
        const normalized: ScoutRun = {
          ...data,
          applications: (data.applications ?? []).map((a) => ({
            ...a,
            status: normalizeAppStatus(a.status),
          })),
        }
        runRef.current = normalized
        setRun(normalized)
        setLoading(false)
        if (onRunUpdated) onRunUpdated()
      } catch {
        if (!stopped) setLoading(false)
      }
    }

    void fetchRun()

    const intervalId = setInterval(() => {
      const current = runRef.current
      if (current && isRunComplete(current)) {
        clearInterval(intervalId)
        return
      }
      void fetchRun()
    }, 5000)

    return () => {
      stopped = true
      clearInterval(intervalId)
    }
  }, [runId, onRunUpdated])

  return { run, loading, isComplete: run != null && isRunComplete(run) }
}

const APPLICATIONS_MAX_AUTH_RETRIES = 4
const APPLICATIONS_AUTH_RETRY_MS = 600
// Transient failures (FastAPI mid-reload in dev, brief network blips) self-heal in
// seconds — keep showing skeletons and retry quietly instead of flashing the
// "Could not load applications" screen on the first miss.
const APPLICATIONS_MAX_TRANSIENT_RETRIES = 5
const APPLICATIONS_TRANSIENT_RETRY_MS = 1500

export type UseApplicationsResult = {
  apps: ApplicationRecord[]
  /** True only before the first successful load (show skeletons, never empty state). */
  loading: boolean
  hasLoaded: boolean
  error: string | null
  refetch: (background?: boolean) => void
}

export function useApplications(): UseApplicationsResult {
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const [apps, setApps] = useState<ApplicationRecord[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)
  const appsRef = useRef<ApplicationRecord[]>([])
  const authRetryRef = useRef(0)
  const transientRetryRef = useRef(0)

  useEffect(() => {
    appsRef.current = apps
  }, [apps])

  const fetchApps = useCallback(
    async (options?: { background?: boolean }) => {
      if (!authLoaded) return

      if (!isSignedIn) {
        setApps([])
        setError(null)
        setHasLoaded(true)
        setIsFetching(false)
        return
      }

      const requestId = ++requestIdRef.current
      const background = options?.background ?? false
      const hasCachedData = appsRef.current.length > 0
      let keepFetching = false

      if (!background || !hasCachedData) {
        setIsFetching(true)
      }

      // Retry quietly on transient failures (5xx / network). While retrying with
      // no cached data, hasLoaded stays false so the skeleton shows instead of
      // the error screen; the screen only appears once retries are exhausted.
      const scheduleTransientRetry = (): boolean => {
        if (transientRetryRef.current >= APPLICATIONS_MAX_TRANSIENT_RETRIES) {
          return false
        }
        transientRetryRef.current += 1
        keepFetching = true
        setError('Reconnecting…')
        window.setTimeout(() => {
          if (requestId === requestIdRef.current) {
            void fetchApps({ background: hasCachedData })
          }
        }, APPLICATIONS_TRANSIENT_RETRY_MS)
        return true
      }

      try {
        const res = await fetch('/api/applications', {
          cache: 'no-store',
          credentials: 'same-origin',
        })

        if (requestId !== requestIdRef.current) return

        if (!res.ok) {
          if (res.status === 401 && authRetryRef.current < APPLICATIONS_MAX_AUTH_RETRIES) {
            authRetryRef.current += 1
            keepFetching = true
            setError('Signing you in…')
            window.setTimeout(() => {
              if (requestId === requestIdRef.current) {
                void fetchApps({ background: hasCachedData })
              }
            }, APPLICATIONS_AUTH_RETRY_MS)
            return
          }

          if (res.status !== 401 && scheduleTransientRetry()) return

          setError(
            res.status === 401
              ? 'Your session expired. Refresh the page or sign in again.'
              : 'We could not reach the server. Try again.',
          )
          if (!hasCachedData) setApps([])
          setHasLoaded(true)
          return
        }

        const data = (await res.json()) as unknown
        const list = Array.isArray(data) ? (data as ApplicationRecord[]) : []

        if (requestId !== requestIdRef.current) return

        authRetryRef.current = 0
        transientRetryRef.current = 0
        setApps(list)
        setError(null)
        setHasLoaded(true)
      } catch {
        if (requestId !== requestIdRef.current) return
        if (scheduleTransientRetry()) return
        setError('Network error. Check your connection and try again.')
        if (!hasCachedData) setApps([])
        setHasLoaded(true)
      } finally {
        if (requestId === requestIdRef.current && !keepFetching) {
          setIsFetching(false)
        }
      }
    },
    [authLoaded, isSignedIn],
  )

  const refetch = useCallback(
    (background = true) => {
      transientRetryRef.current = 0
      void fetchApps({ background })
    },
    [fetchApps],
  )

  useEffect(() => {
    if (!authLoaded) return
    authRetryRef.current = 0
    transientRetryRef.current = 0
    void fetchApps({ background: false })
  }, [authLoaded, isSignedIn, fetchApps])

  useEffect(() => {
    if (!authLoaded || !isSignedIn) return

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchApps({ background: true })
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [authLoaded, isSignedIn, fetchApps])

  const loading = !authLoaded || (!hasLoaded && isFetching)

  return {
    apps,
    loading,
    hasLoaded: authLoaded && hasLoaded,
    error,
    refetch,
  }
}
