'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { AnswerModal } from '@/components/tracker/AnswerModal'
import { ApplicationKanban } from '@/components/tracker/ApplicationKanban'
import { CodeModal } from '@/components/tracker/CodeModal'
import { LiveApplicationFeed } from '@/components/tracker/LiveApplicationFeed'
import {
  MissionControlHeader,
  MissionControlHeaderSkeleton,
  MissionControlOverviewHeader,
} from '@/components/tracker/MissionControlHeader'
import { TrackerFetchError } from '@/components/tracker/TrackerFetchError'
import { TrackerLoadingSkeleton } from '@/components/tracker/ScoutRunTracker'
import { TrackerEmptyState } from '@/components/tracker/TrackerEmptyState'
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
  const [answerApp, setAnswerApp] = useState<ApplicationRecord | null>(null)
  const [codeApp, setCodeApp] = useState<ApplicationRecord | null>(null)

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

  const lifetimeStats = useMemo(() => lifetimeStatsFromApps(apps), [apps])

  const showEmpty = hasLoaded && !error && apps.length === 0
  const showFetchError = hasLoaded && Boolean(error) && apps.length === 0
  const showHistory = !showEmpty && !showFetchError

  const handleAnswerClick = useCallback((app: ApplicationRecord) => {
    setAnswerApp(app)
  }, [])

  const handleCodeClick = useCallback((app: ApplicationRecord) => {
    setCodeApp(app)
  }, [])

  const showHeaderSkeleton =
    appsLoading || (runId ? runLoading && !run : false)

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

      {runId && run ? (
        <LiveApplicationFeed
          run={run}
          applicationRecords={apps}
          onAnswerClick={handleAnswerClick}
          onCodeClick={handleCodeClick}
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
            loading={appsLoading}
            onAnswerClick={handleAnswerClick}
            onCodeClick={handleCodeClick}
          />
        </div>
      ) : null}

      {answerApp ? (
        <AnswerModal
          key={answerApp.id}
          app={answerApp}
          onClose={() => setAnswerApp(null)}
          onSuccess={() => refetch(true)}
        />
      ) : null}

      {codeApp ? (
        <CodeModal
          key={codeApp.id}
          app={codeApp}
          onClose={() => setCodeApp(null)}
          onSuccess={() => refetch(true)}
        />
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
