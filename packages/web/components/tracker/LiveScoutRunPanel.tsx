'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import { scoutLogo } from '@/lib/scout-logo'

type AppStatus =
  | 'queued'
  | 'in_progress'
  | 'applied'
  | 'failed'
  | 'needs_attention'

type ScoutRun = {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_jobs: number
  applied_count: number
  failed_count: number
  needs_attention_count: number
  applications: Array<{ status: AppStatus }>
}

const TERMINAL_STATUSES = new Set<AppStatus>(['applied', 'failed', 'needs_attention'])

function isRunComplete(run: ScoutRun): boolean {
  if (run.status === 'completed') return true
  return (
    run.applications.length > 0 &&
    run.applications.every((a) => TERMINAL_STATUSES.has(a.status))
  )
}

type LiveScoutRunPanelProps = {
  runId: string
  onRunUpdated?: () => void
}

export function LiveScoutRunPanel({ runId, onRunUpdated }: LiveScoutRunPanelProps) {
  const [run, setRun] = useState<ScoutRun | null>(null)
  const [loading, setLoading] = useState(true)
  const runRef = useRef<ScoutRun | null>(null)

  useEffect(() => {
    let stopped = false

    const fetchRun = async () => {
      if (stopped) return
      try {
        const res = await fetch(`/api/scout/status/${runId}`, { cache: 'no-store' })
        if (stopped || !res.ok) return
        const data = (await res.json()) as ScoutRun
        runRef.current = data
        setRun(data)
        setLoading(false)
        onRunUpdated?.()
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

  const isRunning = run?.status === 'pending' || run?.status === 'running'
  const isDone = run != null && isRunComplete(run)
  const total = run?.total_jobs ?? 0
  const applied = run?.applied_count ?? 0
  const progressPct = total > 0 ? Math.round((applied / total) * 100) : 0

  if (loading && !run) {
    return (
      <section className="glass-card animate-pulse rounded-2xl border border-white/[0.06] border-l-4 border-l-[#FF6733]/40 p-5">
        <div className="h-6 w-48 rounded bg-white/[0.05]" />
        <div className="mt-4 h-2 w-full rounded-full bg-white/[0.05]" />
      </section>
    )
  }

  if (!run) return null

  return (
    <AnimatePresence mode="wait">
      <motion.section
        key={isDone ? 'done' : 'running'}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.35 }}
        className="glass-card rounded-2xl border border-white/[0.06] border-l-4 border-l-[#FF6733] p-5"
      >
        {isDone ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-[#22c55e]" strokeWidth={1.5} />
            <div>
              <p className="font-headline text-lg font-medium text-white">
                Scout applied to {applied} internship{applied === 1 ? '' : 's'}
              </p>
              {(run.failed_count > 0 || run.needs_attention_count > 0) && (
                <p className="mt-0.5 font-body text-xs text-[#666]">
                  {run.failed_count > 0 && `${run.failed_count} failed`}
                  {run.failed_count > 0 && run.needs_attention_count > 0 && ' · '}
                  {run.needs_attention_count > 0 &&
                    `${run.needs_attention_count} need attention`}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <motion.div
                animate={
                  isRunning
                    ? { scale: [1, 1.06, 1], opacity: [1, 0.7, 1] }
                    : { scale: 1, opacity: 1 }
                }
                transition={
                  isRunning
                    ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.3 }
                }
                className="h-9 w-9 shrink-0 overflow-hidden rounded-lg"
              >
                <Image
                  src={scoutLogo}
                  alt="Scout"
                  width={36}
                  height={36}
                  className="h-9 w-9 object-contain"
                />
              </motion.div>
              <div>
                <h2 className="font-headline text-lg font-medium text-white">
                  Scout is working…
                </h2>
                <p className="font-body text-sm text-[#666]">
                  {applied} of {total} applications
                </p>
              </div>
              <span className="ml-auto font-mono text-sm text-[#FF6733]">{progressPct}%</span>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-[#FF6733]"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </>
        )}
      </motion.section>
    </AnimatePresence>
  )
}
