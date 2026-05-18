'use client'

import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { JobCard, type JobMatch } from '@/components/jobs/JobCard'
import { Skeleton } from '@/components/ui/skeleton'

export interface JobColumnProps {
  title: string
  count: number
  color: string
  jobs: JobMatch[]
  selectedJobIds: Set<string>
  onToggleSelect: (jobId: string) => void
  loading?: boolean
}

const SCROLL_STEP_PX = 400
const BOTTOM_THRESHOLD_PX = 8

export function JobColumn({
  title,
  count,
  color,
  jobs,
  selectedJobIds,
  onToggleSelect,
  loading = false,
}: JobColumnProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [atBottom, setAtBottom] = useState(true)

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
      <header className="mb-4 flex items-center justify-between">
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
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto pb-20 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-[#1a1a1a] text-white shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition-all duration-200 group-hover:translate-y-0.5 group-hover:border-[#FF6733]/40 group-hover:bg-[#FF6733] group-hover:shadow-[0_0_22px_rgba(255,103,51,0.45)]">
              <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </button>
        ) : null}
      </div>
    </section>
  )
}
