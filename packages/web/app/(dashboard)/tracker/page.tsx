'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo, useState } from 'react'

import { AnswerModal } from '@/components/tracker/AnswerModal'
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
import type { ApplicationRecord } from '@/components/tracker/tracker-utils'
import {
  lifetimeStatsFromApps,
  useApplications,
  useScoutRun,
} from '@/components/tracker/tracker-utils'

function TrackerPageContent() {
  const searchParams = useSearchParams()
  const runId = searchParams.get('run_id')?.trim() || null
  const [answerApp, setAnswerApp] = useState<ApplicationRecord | null>(null)

  const { apps, loading: appsLoading, hasLoaded, error, refetch } =
    useApplications()

  const handleRunUpdated = useCallback(() => {
    refetch(true)
  }, [refetch])

  const { run, loading: runLoading } = useScoutRun(runId, handleRunUpdated)

  const lifetimeStats = useMemo(() => lifetimeStatsFromApps(apps), [apps])

  const showEmpty = hasLoaded && !error && apps.length === 0
  const showFetchError = hasLoaded && Boolean(error) && apps.length === 0
  const showHistory = !showEmpty && !showFetchError

  const handleAnswerClick = useCallback((app: ApplicationRecord) => {
    setAnswerApp(app)
  }, [])

  const showHeaderSkeleton =
    appsLoading || (runId ? runLoading && !run : false)

  const header = showHeaderSkeleton ? (
    <MissionControlHeaderSkeleton />
  ) : runId && run ? (
    <MissionControlHeader run={run} />
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
