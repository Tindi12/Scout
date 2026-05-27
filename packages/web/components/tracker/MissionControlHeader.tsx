'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  formatRelativeTime,
  getRunTitle,
  isRunComplete,
  isRunRunning,
  progressPct,
  type LifetimeOverviewStats,
  type ScoutRun,
} from './tracker-utils'

type MissionControlShellProps = {
  dot: 'pulse-green' | 'static-green' | 'static-gray'
  title: string
  subtext: string
  applied: number
  failed: number
  attention: number
  progressPct: number
  showProgress: boolean
  completionOverlay?: ReactNode
  trailingAction?: ReactNode
}

function MissionControlShell({
  dot,
  title,
  subtext,
  applied,
  failed,
  attention,
  progressPct,
  showProgress,
  completionOverlay,
  trailingAction,
}: MissionControlShellProps) {
  return (
    <section className="relative -mx-5 bg-[#0a0a0a] md:-mx-8">
      <div className="flex flex-col gap-8 px-8 py-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#444]">
            SCOUT AGENT
          </p>
          <div className="mt-3 flex items-center gap-3">
            {dot === 'pulse-green' ? (
              <motion.span
                className="h-2 w-2 shrink-0 rounded-full bg-[#22c55e]"
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  dot === 'static-green' ? 'bg-[#22c55e]' : 'bg-[#555]'
                }`}
              />
            )}
            <h1 className="font-headline text-3xl font-medium text-white">{title}</h1>
          </div>
          <p className="mt-2 font-mono text-sm text-[#555]">{subtext}</p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-4 sm:items-end">
          <div className="flex items-center gap-0">
            <StatBlock value={applied} label="APPLIED" color="#22c55e" />
            <div className="mx-6 h-12 w-px bg-white/[0.06]" aria-hidden />
            <StatBlock value={failed} label="FAILED" color="#ef4444" />
            <div className="mx-6 h-12 w-px bg-white/[0.06]" aria-hidden />
            <StatBlock value={attention} label="ATTENTION" color="#f59e0b" />
          </div>
          {trailingAction}
        </div>
      </div>

      {showProgress ? (
        <div className="h-0.5 w-full bg-white/[0.04]">
          <motion.div
            className="h-full bg-gradient-to-r from-[#FF6733] to-[#22c55e]"
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      ) : null}

      {completionOverlay}
    </section>
  )
}

type MissionControlHeaderProps = {
  run: ScoutRun
}

export function MissionControlHeader({ run }: MissionControlHeaderProps) {
  const running = isRunRunning(run)
  const complete = isRunComplete(run)
  const pct = progressPct(run)
  const title = getRunTitle(run)

  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false)
  const wasCompleteRef = useRef(complete)

  useEffect(() => {
    if (complete && !wasCompleteRef.current) {
      setShowCompletionOverlay(true)
      const t = setTimeout(() => setShowCompletionOverlay(false), 3000)
      return () => clearTimeout(t)
    }
    wasCompleteRef.current = complete
  }, [complete])

  const allFailed =
    complete &&
    run.applications.length > 0 &&
    run.applications.every((a) => a.status === 'failed') &&
    (run.applied_count ?? 0) === 0

  const dot: MissionControlShellProps['dot'] = running
    ? 'pulse-green'
    : complete && !allFailed
      ? 'static-green'
      : 'static-gray'

  const subtext = `Started ${
    run.created_at ? formatRelativeTime(run.created_at) : 'recently'
  } · ${run.total_jobs} application${run.total_jobs === 1 ? '' : 's'}`

  return (
    <MissionControlShell
      dot={dot}
      title={title}
      subtext={subtext}
      applied={run.applied_count}
      failed={run.failed_count}
      attention={run.needs_attention_count}
      progressPct={pct}
      showProgress={(run.total_jobs ?? 0) > 0}
      completionOverlay={
        <AnimatePresence>
          {showCompletionOverlay ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-[2px]"
            >
              <p className="font-headline text-xl font-medium text-white">
                Scout applied to {run.applied_count} internship
                {run.applied_count === 1 ? '' : 's'}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      }
    />
  )
}

type MissionControlOverviewHeaderProps = {
  stats: LifetimeOverviewStats
}

export function MissionControlOverviewHeader({
  stats,
}: MissionControlOverviewHeaderProps) {
  return (
    <MissionControlShell
      dot="static-gray"
      title="Application Overview"
      subtext="Your lifetime application stats"
      applied={stats.applied}
      failed={stats.failed}
      attention={stats.needsAttention}
      progressPct={stats.progressPct}
      showProgress={stats.showProgress}
      trailingAction={
        <Link
          href="/explore"
          className="inline-flex h-9 items-center justify-center self-end rounded-full bg-[#FF6733] px-4 font-label text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_24px_rgba(255,103,51,0.55)] active:scale-[0.97]"
        >
          Jobs →
        </Link>
      }
    />
  )
}

function StatBlock({
  value,
  label,
  color,
}: {
  value: number
  label: string
  color: string
}) {
  return (
    <div className="flex flex-col items-center text-center sm:items-end sm:text-right">
      <span className="font-headline text-5xl font-medium" style={{ color }}>
        {value}
      </span>
      <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[#444]">
        {label}
      </span>
    </div>
  )
}

export function MissionControlHeaderSkeleton() {
  return (
    <section className="-mx-5 animate-pulse bg-[#0a0a0a] md:-mx-8">
      <div className="flex flex-col gap-8 px-8 py-8 lg:flex-row lg:justify-between">
        <div className="flex-1 space-y-3">
          <div className="h-3 w-24 rounded bg-white/[0.05]" />
          <div className="h-9 w-64 rounded bg-white/[0.05]" />
          <div className="h-4 w-48 rounded bg-white/[0.04]" />
        </div>
        <div className="flex gap-8">
          <div className="h-14 w-16 rounded bg-white/[0.05]" />
          <div className="h-14 w-16 rounded bg-white/[0.05]" />
          <div className="h-14 w-16 rounded bg-white/[0.05]" />
        </div>
      </div>
      <div className="h-0.5 w-full bg-white/[0.04]" />
    </section>
  )
}
