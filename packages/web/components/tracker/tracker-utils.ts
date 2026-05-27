'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

export type AppStatus =
  | 'queued'
  | 'in_progress'
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
  status: string | null
  company: string
  role: string
  job_url: string
  error_message: string | null
  applied_at: string | null
  created_at?: string | null
  updated_at?: string | null
}

export const TERMINAL_STATUSES = new Set<AppStatus>([
  'applied',
  'failed',
  'needs_attention',
])

export const STATUS_ORDER: Record<AppStatus, number> = {
  in_progress: 0,
  queued: 1,
  needs_attention: 2,
  applied: 3,
  failed: 4,
}

export const STATUS_CONFIG: Record<
  AppStatus,
  { color: string; label: string; columnColor: string }
> = {
  queued: { color: '#444', label: 'QUEUED', columnColor: '#444' },
  in_progress: { color: '#FF6733', label: 'APPLYING', columnColor: '#FF6733' },
  applied: { color: '#22c55e', label: 'APPLIED', columnColor: '#22c55e' },
  failed: { color: '#ef4444', label: 'FAILED', columnColor: '#ef4444' },
  needs_attention: {
    color: '#f59e0b',
    label: 'ATTENTION',
    columnColor: '#f59e0b',
  },
}

export type PortalType = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'unknown'

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

export function progressPct(run: ScoutRun): number {
  const total = run.total_jobs ?? 0
  if (total <= 0) return 0
  const done =
    (run.applied_count ?? 0) +
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
): LifetimeOverviewStats {
  const applied = apps.filter((a) => a.status === 'applied').length
  const failed = apps.filter((a) => a.status === 'failed').length
  const needsAttention = apps.filter((a) => a.status === 'needs_attention').length
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
    if (allFailed && (run.applied_count ?? 0) === 0) return 'Run failed'
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
            status: (a.status || 'queued') as AppStatus,
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
        setApps(list)
        setError(null)
        setHasLoaded(true)
      } catch {
        if (requestId !== requestIdRef.current) return
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
      void fetchApps({ background })
    },
    [fetchApps],
  )

  useEffect(() => {
    if (!authLoaded) return
    authRetryRef.current = 0
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
