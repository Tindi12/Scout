'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { scoutLogo } from '@/lib/scout-logo'
import { cn } from '@/lib/utils'

type AppStatus =
  | 'queued'
  | 'in_progress'
  | 'applied'
  | 'failed'
  | 'needs_attention'

type Application = {
  id: string
  job_id: string
  company: string
  role: string
  url: string
  status: AppStatus
  error_message: string | null
  applied_at: string | null
}

type RunStatus = 'pending' | 'running' | 'completed' | 'failed'

type ScoutRun = {
  id: string
  status: RunStatus
  total_jobs: number
  applied_count: number
  failed_count: number
  needs_attention_count: number
  created_at: string
  applications: Application[]
}

type PageState = 'loading' | 'not_found' | 'error' | 'loaded'

const TERMINAL_STATUSES = new Set<AppStatus>(['applied', 'failed', 'needs_attention'])

const STATUS_ORDER: Record<AppStatus, number> = {
  in_progress: 0,
  queued: 1,
  applied: 2,
  failed: 3,
  needs_attention: 4,
}

type ScoutRunTrackerProps = {
  runId: string
}

export function ScoutRunTracker({ runId }: ScoutRunTrackerProps) {
  const { toast } = useToast()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [run, setRun] = useState<ScoutRun | null>(null)

  const [answerApp, setAnswerApp] = useState<Application | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false)

  const runRef = useRef<ScoutRun | null>(null)

  useEffect(() => {
    if (!runId) return

    let stopped = false

    const fetchRun = async () => {
      if (stopped) return
      try {
        const res = await fetch(`/api/scout/status/${runId}`, {
          cache: 'no-store',
        })
        if (stopped) return

        if (res.status === 404) {
          setPageState('not_found')
          return
        }
        if (!res.ok) {
          if (!runRef.current) setPageState('error')
          return
        }

        const data = (await res.json()) as ScoutRun
        runRef.current = data
        setRun(data)
        setPageState('loaded')
      } catch {
        if (!stopped && !runRef.current) setPageState('error')
      }
    }

    void fetchRun()

    const intervalId = setInterval(() => {
      const current = runRef.current
      if (
        current &&
        (current.status === 'completed' ||
          (current.applications.length > 0 &&
            current.applications.every((a) => TERMINAL_STATUSES.has(a.status))))
      ) {
        clearInterval(intervalId)
        return
      }
      void fetchRun()
    }, 5000)

    return () => {
      stopped = true
      clearInterval(intervalId)
    }
  }, [runId])

  const handleSubmitAnswer = async () => {
    if (!answerApp || !answerText.trim()) return
    setIsSubmittingAnswer(true)
    try {
      const res = await fetch(`/api/applications/${answerApp.id}/answer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answerText.trim() }),
      })
      if (!res.ok) {
        toast({
          title: 'Could not submit answer',
          description: 'Please try again.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Answer submitted',
          description: 'Scout will retry this application.',
        })
        setAnswerApp(null)
        setAnswerText('')
      }
    } catch {
      toast({
        title: 'Network error',
        description: 'Could not reach the server.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingAnswer(false)
    }
  }

  const isRunning = run?.status === 'pending' || run?.status === 'running'
  const isDone =
    run?.status === 'completed' ||
    (run != null &&
      run.applications.length > 0 &&
      run.applications.every((a) => TERMINAL_STATUSES.has(a.status)))

  const pageTitle = isDone
    ? 'Scout finished'
    : (run?.needs_attention_count ?? 0) > 0
      ? 'Scout needs your attention'
      : 'Scout is working'

  const sortedApps = [...(run?.applications ?? [])].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  )

  const progressPct =
    (run?.total_jobs ?? 0) > 0
      ? Math.round(((run?.applied_count ?? 0) / run!.total_jobs) * 100)
      : 0

  if (pageState === 'loading') {
    return <TrackerLoadingSkeleton />
  }

  if (pageState === 'not_found' || pageState === 'error') {
    return (
      <section className="flex flex-col items-center gap-6 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ef4444]/10">
          <AlertCircle className="h-7 w-7 text-[#ef4444]" strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <h2 className="font-headline text-xl font-medium text-white">
            {pageState === 'not_found' ? 'Scout run not found' : 'Something went wrong'}
          </h2>
          <p className="font-body text-sm text-[#888]">
            {pageState === 'not_found'
              ? "We couldn't find this Scout run."
              : 'We could not load the Scout run status. Please try again.'}
          </p>
        </div>
        <Link
          href="/explore"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 font-label text-sm font-semibold text-[#bbb] transition-colors hover:border-[#FF6733]/40 hover:bg-[#FF6733]/[0.06] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Back to Jobs
        </Link>
      </section>
    )
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link
            href="/explore"
            className="inline-flex w-fit items-center gap-1.5 font-label text-sm text-[#888] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Jobs
          </Link>

          <div className="flex items-center gap-4">
            <motion.div
              animate={
                isRunning
                  ? {
                      scale: [1, 1.08, 1],
                      opacity: [1, 0.65, 1],
                    }
                  : { scale: 1, opacity: 1 }
              }
              transition={
                isRunning
                  ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.3 }
              }
              className="h-10 w-10 overflow-hidden rounded-xl"
            >
              <Image
                src={scoutLogo}
                alt="Scout"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
            </motion.div>

            <div>
              <h1 className="font-headline text-2xl font-medium tracking-[-0.02em] text-white md:text-3xl">
                {pageTitle}
              </h1>
              <p className="font-body text-sm text-[#666]">
                {run?.total_jobs ?? 0}{' '}
                {(run?.total_jobs ?? 0) === 1 ? 'application' : 'applications'} queued
              </p>
            </div>
          </div>
        </header>

        <section className="glass-card rounded-2xl border border-white/[0.06] p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-label text-sm font-medium text-white">
              {run?.applied_count ?? 0} of {run?.total_jobs ?? 0} applications
            </p>
            <span className="font-mono text-sm text-[#FF6733]">{progressPct}%</span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-[#FF6733]"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <CountChip value={run?.applied_count ?? 0} label="Applied" color="#22c55e" />
            <span aria-hidden className="h-4 w-px bg-[#1f1f1f]" />
            <CountChip value={run?.failed_count ?? 0} label="Failed" color="#ef4444" />
            <span aria-hidden className="h-4 w-px bg-[#1f1f1f]" />
            <CountChip
              value={run?.needs_attention_count ?? 0}
              label="Need Attention"
              color="#FF6733"
            />
          </div>
        </section>

        <AnimatePresence>
          {isDone && (
            <motion.section
              key="completion"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="glass-card rounded-2xl border border-white/[0.06] p-6 text-center"
            >
              <div className="mb-3 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-[#22c55e]" strokeWidth={1.5} />
              </div>
              <p className="font-headline text-4xl font-medium tracking-tight text-white">
                {run?.applied_count ?? 0}
              </p>
              <p className="mt-1 font-body text-sm text-[#888]">
                {(run?.applied_count ?? 0) === 1
                  ? 'internship applied to'
                  : 'internships applied to'}
              </p>
              {((run?.failed_count ?? 0) > 0 ||
                (run?.needs_attention_count ?? 0) > 0) && (
                <p className="mt-1 font-body text-xs text-[#555]">
                  {run?.failed_count ?? 0} failed
                  {(run?.needs_attention_count ?? 0) > 0 &&
                    ` · ${run?.needs_attention_count} need attention`}
                </p>
              )}

              <div className="mt-5 flex justify-center">
                <Link
                  href="/explore"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_24px_rgba(255,103,51,0.55)] active:scale-[0.97]"
                >
                  <Send className="h-3.5 w-3.5" strokeWidth={2} />
                  Run Scout Again
                </Link>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {sortedApps.length > 0 && (
          <section className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {sortedApps.map((app) => (
                <motion.div
                  key={app.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <ApplicationRow
                    app={app}
                    onAnswerClick={() => {
                      setAnswerApp(app)
                      setAnswerText('')
                    }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </section>
        )}
      </div>

      <Dialog
        open={answerApp != null}
        onOpenChange={(open) => {
          if (isSubmittingAnswer) return
          if (!open) {
            setAnswerApp(null)
            setAnswerText('')
          }
        }}
      >
        <DialogContent className="glass-card-strong max-w-md gap-5 rounded-2xl border-white/10 bg-[#0a0a0a]/90 p-7 text-white">
          <DialogHeader className="text-left sm:text-left">
            <DialogTitle className="font-headline text-lg font-medium tracking-[-0.02em] text-white">
              Answer Required
            </DialogTitle>
            {answerApp?.company && (
              <p className="font-body text-sm text-[#888]">
                {answerApp.company} — {answerApp.role}
              </p>
            )}
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {answerApp?.error_message && (
              <div className="rounded-xl border border-[#FF6733]/20 bg-[#FF6733]/[0.06] p-3">
                <p className="font-body text-sm text-white">{answerApp.error_message}</p>
              </div>
            )}

            <textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Type your answer…"
              rows={4}
              disabled={isSubmittingAnswer}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-body text-sm text-white placeholder-[#555] outline-none transition focus:border-[#FF6733]/40 focus:ring-0 disabled:opacity-60"
            />
          </div>

          <DialogFooter className="sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setAnswerApp(null)
                setAnswerText('')
              }}
              disabled={isSubmittingAnswer}
              className="inline-flex h-10 items-center justify-center rounded-full px-5 font-label text-sm font-medium text-[#999] transition-colors hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitAnswer()}
              disabled={isSubmittingAnswer || !answerText.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_24px_rgba(255,103,51,0.55)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmittingAnswer ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  Submitting…
                </>
              ) : (
                'Submit Answer'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function TrackerLoadingSkeleton() {
  return (
    <div className="flex w-full flex-col">
      <section className="-mx-5 animate-pulse bg-[#0a0a0a] md:-mx-8">
        <div className="flex flex-col gap-8 px-8 py-8 lg:flex-row lg:justify-between">
          <div className="flex-1 space-y-3">
            <div className="h-3 w-24 rounded bg-white/[0.05]" />
            <div className="h-9 w-72 rounded bg-white/[0.05]" />
            <div className="h-4 w-52 rounded bg-white/[0.04]" />
          </div>
          <div className="flex gap-10">
            <div className="h-14 w-14 rounded bg-white/[0.05]" />
            <div className="h-14 w-14 rounded bg-white/[0.05]" />
            <div className="h-14 w-14 rounded bg-white/[0.05]" />
          </div>
        </div>
        <div className="h-0.5 w-full bg-white/[0.04]" />
      </section>
      <section className="-mx-5 md:-mx-8">
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
      <div className="mx-auto mt-10 w-full max-w-7xl px-0">
        <div className="h-3 w-40 animate-pulse rounded bg-white/[0.05]" />
        <div className="mt-4 hidden gap-3 lg:grid lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[80px] animate-pulse border-t-[3px] border-white/[0.06] pt-3"
            >
              <div className="h-16 rounded-xl bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CountChip({
  value,
  label,
  color,
}: {
  value: number
  label: string
  color: string
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-headline text-xl font-medium" style={{ color }}>
        {value}
      </span>
      <span className="font-label text-xs text-[#666]">{label}</span>
    </div>
  )
}

function ApplicationRow({
  app,
  onAnswerClick,
}: {
  app: Application
  onAnswerClick: () => void
}) {
  return (
    <div className="glass-card flex items-center gap-4 rounded-2xl border border-white/[0.06] px-4 py-3">
      <StatusDot status={app.status} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-label text-sm font-medium text-white">{app.company}</p>
        <p className="truncate font-body text-xs text-[#888]">{app.role}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <StatusPill status={app.status} />

        {app.url && (
          <a
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.08] px-2.5 font-label text-[11px] text-[#888] transition-colors hover:border-white/20 hover:text-white"
          >
            View
            <ExternalLink className="h-3 w-3" strokeWidth={2} />
          </a>
        )}

        {app.status === 'needs_attention' && (
          <button
            type="button"
            onClick={onAnswerClick}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-[#FF6733]/20 px-2.5 font-label text-[11px] font-semibold text-[#FF6733] transition-colors hover:bg-[#FF6733]/30"
          >
            <AlertCircle className="h-3 w-3" strokeWidth={2} />
            Answer Required
          </button>
        )}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: AppStatus }) {
  if (status === 'needs_attention') {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
        <AlertCircle className="h-4 w-4 text-[#FF6733]" strokeWidth={2.5} />
      </div>
    )
  }

  const dotClass = cn(
    'h-2.5 w-2.5 shrink-0 rounded-full',
    status === 'queued' && 'bg-[#555] animate-pulse',
    status === 'in_progress' && 'bg-[#FF6733] animate-pulse',
    status === 'applied' && 'bg-[#22c55e]',
    status === 'failed' && 'bg-[#ef4444]',
  )

  return <span className={dotClass} />
}

function StatusPill({ status }: { status: AppStatus }) {
  const labelMap: Record<AppStatus, string> = {
    queued: 'Queued',
    in_progress: 'In Progress',
    applied: 'Applied',
    failed: 'Failed',
    needs_attention: 'Needs Attention',
  }

  const colorMap: Record<AppStatus, string> = {
    queued: 'bg-white/[0.05] text-[#666]',
    in_progress: 'bg-[#FF6733]/20 text-[#FF6733]',
    applied: 'bg-[#22c55e]/20 text-[#22c55e]',
    failed: 'bg-[#ef4444]/20 text-[#ef4444]',
    needs_attention: 'bg-[#FF6733]/15 text-[#FF6733]',
  }

  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 font-label text-[11px] font-medium',
        colorMap[status],
      )}
    >
      {labelMap[status]}
    </span>
  )
}
