'use client'

import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { JobCard, type JobMatch } from '@/components/jobs/JobCard'
import { Skeleton } from '@/components/ui/skeleton'

export interface JobColumnProps {
  title: string
  count: number
  color: string
  jobs: JobMatch[]
  selectedJobIds: Set<string>
  onToggleSelect: (jobId: string) => void
  onSelectAllInColumn?: () => void
  onDeselectAllInColumn?: () => void
  loading?: boolean
  resumeId: string | null
  isPro: boolean
  tailoredJobIds: Set<string>
  onVariantCached: (jobId: string) => void
}

const SCROLL_STEP_PX = 400
const BOTTOM_THRESHOLD_PX = 8

export function ColumnSelectActions({
  jobIds,
  selectedJobIds,
  onSelectAll,
  onDeselectAll,
  className,
}: {
  jobIds: string[]
  selectedJobIds: Set<string>
  onSelectAll: () => void
  onDeselectAll: () => void
  className?: string
}) {
  if (jobIds.length === 0) return null

  const selectedInColumn = jobIds.filter((id) => selectedJobIds.has(id)).length
  const allSelected = selectedInColumn === jobIds.length
  const noneSelected = selectedInColumn === 0

  return (
    <div
      className={`flex items-center gap-2${className ? ` ${className}` : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onSelectAll}
        disabled={allSelected}
        className="font-label text-[10px] text-[#666] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-[#666]"
      >
        Select all
      </button>
      <span aria-hidden className="h-2.5 w-px bg-[#1f1f1f]" />
      <button
        type="button"
        onClick={onDeselectAll}
        disabled={noneSelected}
        className="font-label text-[10px] text-[#666] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-[#666]"
      >
        Deselect all
      </button>
    </div>
  )
}

export function JobColumn({
  title,
  count,
  color,
  jobs,
  selectedJobIds,
  onToggleSelect,
  onSelectAllInColumn,
  onDeselectAllInColumn,
  loading = false,
  resumeId,
  isPro,
  tailoredJobIds,
  onVariantCached,
}: JobColumnProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const jobIds = useMemo(() => jobs.map((j) => j.id), [jobs])

  const recompute = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    const overflows =
      node.scrollHeight - node.clientHeight > BOTTOM_THRESHOLD_PX
    setHasOverflow(overflows)
    setAtBottom(
      !overflows ||
        node.scrollTop + node.clientHeight >=
          node.scrollHeight - BOTTOM_THRESHOLD_PX,
    )
  }, [])

  // Recheck whenever job set / loading state changes.
  useEffect(() => {
    recompute()
  }, [jobs, loading, recompute])

  // ResizeObserver catches column-height changes (viewport resize, sibling
  // column growth, etc.). Falls back to window resize if unavailable.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', recompute)
      return () => window.removeEventListener('resize', recompute)
    }
    const observer = new ResizeObserver(() => recompute())
    observer.observe(node)
    return () => observer.disconnect()
  }, [recompute])

  const handleScroll = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    setAtBottom(
      node.scrollTop + node.clientHeight >=
        node.scrollHeight - BOTTOM_THRESHOLD_PX,
    )
  }, [])

  const handleScrollDown = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollBy({ top: SCROLL_STEP_PX, behavior: 'smooth' })
  }, [])

  const showFade = !loading && hasOverflow && !atBottom

  return (
    <section className="relative flex h-[calc(100vh-260px)] min-h-[480px] flex-col">
      <header className="mb-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#888]">
            {title}
          </h2>
          </div>
          <span className="glass-pill rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-[#888]">
            {count}
          </span>
        </div>
        {!loading && onSelectAllInColumn && onDeselectAllInColumn ? (
          <ColumnSelectActions
            jobIds={jobIds}
            selectedJobIds={selectedJobIds}
            onSelectAll={onSelectAllInColumn}
            onDeselectAll={onDeselectAllInColumn}
          />
        ) : null}
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto pb-20 pr-1 scrollbar-none"
        >
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="py-10 text-center font-body text-sm italic text-[#444]">
              No {title.toLowerCase()} matches yet
            </p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selectedJobIds.has(job.id)}
                  onToggleSelect={onToggleSelect}
                  resumeId={resumeId}
                  isPro={isPro}
                  hasTailoredVariant={tailoredJobIds.has(job.id)}
                  onVariantCached={onVariantCached}
                />
              ))}
            </div>
          )}
        </div>

        {showFade ? (
          <button
            type="button"
            aria-label={`Scroll ${title} column down`}
            onClick={handleScrollDown}
            className="group pointer-events-auto absolute inset-x-0 bottom-0 flex h-24 cursor-pointer items-end justify-center pb-3 transition-opacity duration-200"
            style={{
              background:
                'linear-gradient(to bottom, rgba(8,8,8,0) 0%, rgba(8,8,8,0.85) 60%, #080808 100%)',
            }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-[#1a1a1a] text-white shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition-all duration-200 group-hover:translate-y-0.5 group-hover:border-primary/40 group-hover:bg-primary">
              <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </button>
        ) : null}
      </div>
    </section>
  )
}
