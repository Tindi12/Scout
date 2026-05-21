'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useState } from 'react'

import { ApplicationKanban } from '@/components/tracker/ApplicationKanban'
import { LiveScoutRunPanel } from '@/components/tracker/LiveScoutRunPanel'
import { TrackerLoadingSkeleton } from '@/components/tracker/ScoutRunTracker'

function TrackerPageContent() {
  const searchParams = useSearchParams()
  const runId = searchParams.get('run_id')?.trim() || null
  const [kanbanRefresh, setKanbanRefresh] = useState(0)

  const handleRunUpdated = useCallback(() => {
    setKanbanRefresh((n) => n + 1)
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8">
      <header>
        <h1 className="font-headline text-2xl font-medium tracking-[-0.02em] text-white md:text-3xl">
          Tracker
        </h1>
        <p className="mt-1 font-body text-sm text-[#666]">
          Live Scout runs and your full application history
        </p>
      </header>

      {runId ? (
        <LiveScoutRunPanel runId={runId} onRunUpdated={handleRunUpdated} />
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="font-label text-sm font-semibold uppercase tracking-wider text-[#666]">
          Applications
        </h2>
        <ApplicationKanban refreshKey={kanbanRefresh} />
      </section>
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
