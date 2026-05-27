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
  truncateError,
  type ApplicationRecord,
  type AppStatus,
  type EnrichedRunApplication,
  type ScoutRun,
} from './tracker-utils'

type LiveApplicationFeedProps = {
  run: ScoutRun
  applicationRecords: ApplicationRecord[]
  onAnswerClick: (app: ApplicationRecord) => void
}

export function LiveApplicationFeed({
  run,
  applicationRecords,
  onAnswerClick,
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
              <FeedRow app={app} onAnswerClick={onAnswerClick} records={applicationRecords} />
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
  records,
}: {
  app: EnrichedRunApplication
  onAnswerClick: (app: ApplicationRecord) => void
  records: ApplicationRecord[]
}) {
  const config = STATUS_CONFIG[app.status]
  const portal = detectPortalFromUrl(app.job_url)
  const record = records.find((r) => r.id === app.id)

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
  if (status === 'in_progress') {
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
    return <InProgressTimer updatedAt={app.updated_at} />
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
  return null
}

function InProgressTimer({ updatedAt }: { updatedAt: string | null }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = updatedAt ? new Date(updatedAt).getTime() : Date.now()
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [updatedAt])

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
