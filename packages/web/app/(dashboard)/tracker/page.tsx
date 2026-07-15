'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { ApplicationKanban } from '@/components/tracker/ApplicationKanban'
import { LiveApplicationFeed } from '@/components/tracker/LiveApplicationFeed'
import {
  MissionControlHeader,
  MissionControlHeaderSkeleton,
  MissionControlOverviewHeader,
} from '@/components/tracker/MissionControlHeader'
import { TrackerFetchError } from '@/components/tracker/TrackerFetchError'
import { TrackerLoadingSkeleton } from '@/components/tracker/ScoutRunTracker'
import { TrackerEmptyState } from '@/components/tracker/TrackerEmptyState'
import { useNotificationsContext } from '@/contexts/notifications-context'
import { useToast } from '@/hooks/use-toast'
import type { ApplicationRecord } from '@/components/tracker/tracker-utils'
import {
  activeRunIdFromApps,
  isRunComplete,
  lifetimeStatsFromApps,
  useApplications,
  useScoutRun,
} from '@/components/tracker/tracker-utils'

// The live run section is selected by ?run_id=, but in-app navigation back to
// /tracker carries no query param — leaving and returning used to drop the live
// feed (and its timer) entirely. Remember the active run per tab and restore it.
const RUN_ID_STORE_KEY = 'scout:active-run-id'

function TrackerPageContent() {
  const searchParams = useSearchParams()
  const urlRunId = searchParams.get('run_id')?.trim() || null
  const [restoredRunId, setRestoredRunId] = useState<string | null>(null)

  useEffect(() => {
    if (urlRunId) {
      try {
        window.sessionStorage.setItem(RUN_ID_STORE_KEY, urlRunId)
      } catch {
        // storage unavailable — restoration is best-effort
      }
      setRestoredRunId(null)
      return
    }
    try {
      setRestoredRunId(window.sessionStorage.getItem(RUN_ID_STORE_KEY))
    } catch {
      // ignore
    }
  }, [urlRunId])

  const { apps, loading: appsLoading, hasLoaded, error, refetch } =
    useApplications()

  // Resolution order: explicit URL param → run remembered for this tab → run
  // derived from the applications data itself (covers a brand-new tab, or a tab
  // that navigated away before the run id was ever remembered).
  const derivedRunId = useMemo(() => activeRunIdFromApps(apps), [apps])
  const runId = urlRunId ?? restoredRunId ?? derivedRunId

  // Latch a derived run id like a remembered one, so the view doesn't vanish
  // the instant the run completes (derived ids disappear with their active apps).
  useEffect(() => {
    if (!urlRunId && !restoredRunId && derivedRunId) {
      try {
        window.sessionStorage.setItem(RUN_ID_STORE_KEY, derivedRunId)
      } catch {
        // ignore
      }
      setRestoredRunId(derivedRunId)
    }
  }, [urlRunId, restoredRunId, derivedRunId])

  const handleRunUpdated = useCallback(() => {
    refetch(true)
  }, [refetch])

  const { run, loading: runLoading } = useScoutRun(runId, handleRunUpdated)

  // Same server-persisted dismissals the kanban uses: an X-ed attention card
  // must also leave the header's ATTENTION count, or it reads "1" over an
  // empty board. dismissalsLoading gates first paint: the overlay arrives from
  // a separate fetch than the applications, and rendering before it lands
  // showed dismissed attention cards for a beat before they vanished.
  const {
    isApplicationDismissed,
    loading: dismissalsLoading,
    refetch: refetchNotifications,
  } = useNotificationsContext()

  // Once the run finishes, stop restoring it — this visit keeps showing the
  // completed run, but the next return to /tracker goes back to the overview.
  useEffect(() => {
    if (run && isRunComplete(run)) {
      try {
        window.sessionStorage.removeItem(RUN_ID_STORE_KEY)
      } catch {
        // ignore
      }
    }
  }, [run])

  const lifetimeStats = useMemo(
    () => lifetimeStatsFromApps(apps, isApplicationDismissed),
    [apps, isApplicationDismissed],
  )

  const showEmpty = hasLoaded && !error && apps.length === 0
  const showFetchError = hasLoaded && Boolean(error) && apps.length === 0
  const showHistory = !showEmpty && !showFetchError

  const { toast } = useToast()

  // Retry re-runs a failed OR needs_attention application through the normal
  // Scout apply flow. The prior attempt's credit was already refunded
  // server-side, so this charges one fresh credit like any Send Scout.
  const handleRetry = useCallback(
    async (app: Pick<ApplicationRecord, 'id' | 'company'>) => {
      try {
        const res = await fetch(
          `/api/applications/${encodeURIComponent(app.id)}/retry`,
          { method: 'POST' },
        )
        if (!res.ok) {
          let description = 'Please try again in a moment.'
          try {
            const data = (await res.json()) as {
              detail?: string | { message?: string }
            }
            if (typeof data.detail === 'string') description = data.detail
            else if (typeof data.detail?.message === 'string') {
              description = data.detail.message
            }
          } catch {
            // non-JSON error body — keep the generic copy
          }
          toast({
            title: 'Could not retry this application',
            description,
            variant: 'destructive',
          })
          return
        }

        const data = (await res.json()) as { scout_run_id?: string }
        // Point the live section at the retry's run so the user sees Scout
        // pick the application back up immediately.
        if (data.scout_run_id) {
          try {
            window.sessionStorage.setItem(RUN_ID_STORE_KEY, data.scout_run_id)
          } catch {
            // storage unavailable — the feed still appears via derivedRunId
          }
          setRestoredRunId(data.scout_run_id)
        }
        toast({
          title: 'Retry started',
          description: `Scout is applying to ${app.company || 'this job'} again.`,
        })
        refetch(true)
        // The retry just created a fresh notification server-side (superseding
        // any earlier dismissal for this application — see
        // notification_service.dismissed_application_ids), but this hook's own
        // dismissedApplicationIds is local state on a 15s poll and won't know
        // that yet. Without this, a previously-dismissed application that fails
        // again quickly could still read as dismissed for up to 15s: hidden from
        // the live feed, or — if it lands back on needs_attention — from the
        // Kanban's attention column too.
        void refetchNotifications()
      } catch {
        toast({
          title: 'Network error',
          description: 'Could not reach the server.',
          variant: 'destructive',
        })
      }
    },
    [refetch, refetchNotifications, toast],
  )

  const showHeaderSkeleton =
    appsLoading || dismissalsLoading || (runId ? runLoading && !run : false)

  const header = showHeaderSkeleton ? (
    <MissionControlHeaderSkeleton />
  ) : runId && run ? (
    <MissionControlHeader run={run} stats={lifetimeStats} />
  ) : (
    <MissionControlOverviewHeader stats={lifetimeStats} />
  )

  return (
    <div className="flex w-full flex-col">
      {header}

      {runId && run && !dismissalsLoading ? (
        <LiveApplicationFeed
          run={run}
          applicationRecords={apps}
          onRetry={handleRetry}
        />
      ) : null}

      {showFetchError ? (
        <TrackerFetchError
          message={error ?? 'Something went wrong.'}
          onRetry={() => refetch(false)}
        />
      ) : showEmpty ? (
        <TrackerEmptyState />
      ) : showHistory ? (
        <div
          className={`mx-auto w-full max-w-7xl px-0 ${runId ? 'mt-10' : 'pt-6'}`}
        >
          <ApplicationKanban
            apps={apps}
            loading={appsLoading || dismissalsLoading}
            onRetry={handleRetry}
          />
        </div>
      ) : null}
    </div>
  )
}

export default function TrackerPage() {
  return (
    <Suspense fallback={<TrackerLoadingSkeleton />}>
      <TrackerPageContent />
    </Suspense>
  )
}
