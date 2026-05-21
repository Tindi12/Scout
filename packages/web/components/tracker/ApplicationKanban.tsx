'use client'

import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export type ApplicationRecord = {
  id: string
  job_id: string
  status: string | null
  company: string
  role: string
  job_url: string
  error_message: string | null
  applied_at: string | null
}

type KanbanColumnId =
  | 'queued'
  | 'in_progress'
  | 'applied'
  | 'failed'
  | 'needs_attention'

const COLUMNS: ReadonlyArray<{
  id: KanbanColumnId
  label: string
  statuses: readonly string[]
}> = [
  { id: 'queued', label: 'Queued', statuses: ['queued'] },
  { id: 'in_progress', label: 'In Progress', statuses: ['in_progress'] },
  { id: 'applied', label: 'Applied', statuses: ['applied'] },
  { id: 'failed', label: 'Failed', statuses: ['failed'] },
  { id: 'needs_attention', label: 'Needs Attention', statuses: ['needs_attention'] },
]

function formatAppliedAt(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

function StatusPill({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    queued: 'bg-white/[0.05] text-[#666]',
    in_progress: 'bg-[#FF6733]/20 text-[#FF6733]',
    applied: 'bg-[#22c55e]/20 text-[#22c55e]',
    failed: 'bg-[#ef4444]/20 text-[#ef4444]',
    needs_attention: 'bg-[#FF6733]/15 text-[#FF6733]',
  }
  const labelMap: Record<string, string> = {
    queued: 'Queued',
    in_progress: 'In Progress',
    applied: 'Applied',
    failed: 'Failed',
    needs_attention: 'Needs Attention',
  }
  const key = status in colorMap ? status : 'queued'
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 font-label text-[10px] font-medium',
        colorMap[key],
      )}
    >
      {labelMap[key] ?? status}
    </span>
  )
}

type ApplicationKanbanProps = {
  refreshKey?: number
}

export function ApplicationKanban({ refreshKey = 0 }: ApplicationKanbanProps) {
  const { toast } = useToast()
  const [apps, setApps] = useState<ApplicationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [answerApp, setAnswerApp] = useState<ApplicationRecord | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadApps = useCallback(async () => {
    try {
      const res = await fetch('/api/applications', { cache: 'no-store' })
      if (!res.ok) {
        setApps([])
        return
      }
      const data = (await res.json()) as ApplicationRecord[]
      setApps(Array.isArray(data) ? data : [])
    } catch {
      setApps([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void loadApps()
  }, [loadApps, refreshKey])

  const grouped = useMemo(() => {
    const map: Record<KanbanColumnId, ApplicationRecord[]> = {
      queued: [],
      in_progress: [],
      applied: [],
      failed: [],
      needs_attention: [],
    }
    for (const app of apps) {
      const status = (app.status || 'queued') as KanbanColumnId
      if (status in map) {
        map[status].push(app)
      } else {
        map.queued.push(app)
      }
    }
    return map
  }, [apps])

  const handleSubmitAnswer = async () => {
    if (!answerApp || !answerText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/applications/${answerApp.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answerText.trim() }),
      })
      if (!res.ok) {
        toast({
          title: 'Could not submit answer',
          description: 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Answer submitted',
        description: 'Scout will retry this application.',
      })
      setAnswerApp(null)
      setAnswerText('')
      await loadApps()
    } catch {
      toast({
        title: 'Network error',
        description: 'Could not reach the server.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-5">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className="glass-card min-h-[120px] animate-pulse rounded-2xl border border-white/[0.06] p-3"
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-3">
        {COLUMNS.map((col) => {
          const cards = grouped[col.id]
          return (
            <div key={col.id} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between px-0.5">
                <h3 className="font-label text-[11px] font-semibold uppercase tracking-wider text-[#666]">
                  {col.label}
                </h3>
                <span className="font-mono text-[10px] text-[#555]">{cards.length}</span>
              </div>

              <div className="flex flex-col gap-2">
                {cards.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/[0.06] px-3 py-6 text-center">
                    <p className="font-body text-xs text-[#555]">No applications</p>
                  </div>
                ) : (
                  cards.map((app) => (
                    <article
                      key={app.id}
                      className="glass-card rounded-xl border border-white/[0.06] p-3"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-label text-sm font-semibold text-white">
                            {app.company || 'Unknown company'}
                          </p>
                          <p className="truncate font-body text-xs text-[#888]">
                            {app.role || 'Role'}
                          </p>
                        </div>
                        <StatusPill status={app.status || 'queued'} />
                      </div>

                      {app.status === 'failed' && app.error_message && (
                        <p className="mb-2 font-body text-[11px] leading-snug text-[#ef4444]/90">
                          {app.error_message}
                        </p>
                      )}

                      {app.status === 'applied' && app.applied_at && (
                        <p className="mb-2 font-body text-[10px] text-[#555]">
                          Applied {formatAppliedAt(app.applied_at)}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {app.job_url ? (
                          <a
                            href={app.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-label text-[11px] text-[#888] transition-colors hover:text-white"
                          >
                            View Job
                            <ExternalLink className="h-3 w-3" strokeWidth={2} />
                          </a>
                        ) : null}

                        {app.status === 'needs_attention' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAnswerApp(app)
                              setAnswerText('')
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-[#FF6733]/20 px-2 py-0.5 font-label text-[11px] font-semibold text-[#FF6733] transition-colors hover:bg-[#FF6733]/30"
                          >
                            <AlertCircle className="h-3 w-3" strokeWidth={2} />
                            Answer Required
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog
        open={answerApp != null}
        onOpenChange={(open) => {
          if (submitting) return
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
            {answerApp && (
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
              disabled={submitting}
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
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-full px-5 font-label text-sm font-medium text-[#999] transition-colors hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitAnswer()}
              disabled={submitting || !answerText.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_24px_rgba(255,103,51,0.55)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? (
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
