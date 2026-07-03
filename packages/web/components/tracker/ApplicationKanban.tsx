'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { PortalBadge } from '@/components/tracker/PortalBadge'
import { ApplicationOutcomeChip } from '@/components/tracker/ApplicationOutcomeChip'
import {
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  detectPortalFromUrl,
  formatRelativeTime,
  STATUS_CONFIG,
  type ApplicationRecord,
} from '@/components/tracker/tracker-utils'

export type { ApplicationRecord } from '@/components/tracker/tracker-utils'

type KanbanColumnId =
  | 'queued'
  | 'in_progress'
  | 'applied'
  | 'failed'
  | 'needs_attention'

const COLUMNS: ReadonlyArray<{
  id: KanbanColumnId
  label: string
}> = [
  { id: 'queued', label: 'QUEUED' },
  { id: 'in_progress', label: 'IN PROGRESS' },
  { id: 'applied', label: 'APPLIED' },
  { id: 'failed', label: 'FAILED' },
  { id: 'needs_attention', label: 'ATTENTION' },
]

function defaultOpenColumns(
  grouped: Record<KanbanColumnId, ApplicationRecord[]>,
): string[] {
  const open: string[] = []
  if (grouped.in_progress.length > 0) open.push('in_progress')
  if (grouped.needs_attention.length > 0) open.push('needs_attention')
  if (open.length === 0 && grouped.applied.length > 0) open.push('applied')
  return open
}

type ApplicationKanbanProps = {
  apps: ApplicationRecord[]
  loading?: boolean
  onAnswerClick?: (app: ApplicationRecord) => void
  onCodeClick?: (app: ApplicationRecord) => void
}

export function ApplicationKanban({
  apps,
  loading = false,
  onAnswerClick,
  onCodeClick,
}: ApplicationKanbanProps) {
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
      } else if (app.status === 'awaiting_code') {
        // Time-sensitive live state: surface it in ATTENTION (which auto-opens)
        // so the Enter Email Code card is impossible to miss. When the code is
        // sent the status flips back to in_progress and the card moves home.
        map.needs_attention.push(app)
      } else {
        map.queued.push(app)
      }
    }
    return map
  }, [apps])

  const defaultOpen = useMemo(() => defaultOpenColumns(grouped), [grouped])

  if (loading) {
    return <KanbanSkeleton />
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#444]">
          APPLICATION HISTORY
        </p>
        <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 font-mono text-[10px] text-[#555]">
          {apps.length}
        </span>
      </div>

      <div className="hidden lg:grid lg:grid-cols-5 lg:gap-3 lg:items-start">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            columnId={col.id}
            label={col.label}
            cards={grouped[col.id]}
            onAnswerClick={onAnswerClick}
            onCodeClick={onCodeClick}
          />
        ))}
      </div>

      <Accordion.Root
        type="multiple"
        defaultValue={defaultOpen}
        className="flex flex-col gap-2 lg:hidden"
      >
        {COLUMNS.map((col) => (
          <Accordion.Item
            key={col.id}
            value={col.id}
            className="border-t-[3px]"
            style={{ borderTopColor: STATUS_CONFIG[col.id].columnColor }}
          >
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full items-center justify-between gap-2 py-3 text-left">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STATUS_CONFIG[col.id].color }}
                  />
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{ color: STATUS_CONFIG[col.id].color }}
                  >
                    {col.label}
                  </span>
                  <span className="font-mono text-[10px] text-[#444]">
                    {grouped[col.id].length}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#444] transition-transform group-data-[state=open]:rotate-180" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <div className="flex flex-col gap-2 pb-3">
                {grouped[col.id].length === 0 ? (
                  <p className="py-6 text-center font-mono text-[#333]">—</p>
                ) : (
                  grouped[col.id].map((app) => (
                    <KanbanCard
                      key={app.id}
                      app={app}
                      onAnswerClick={onAnswerClick}
                      onCodeClick={onCodeClick}
                    />
                  ))
                )}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
      </div>
    </TooltipProvider>
  )
}

// Scroll affordance mirroring the jobs page columns
// scrollbar plus a gradient fade + chevron button while there is more content
// below. Unlike the jobs page (which caps by viewport height), kanban cards are
// short, so we cap the visible area to the first three cards and let the fade
// begin on the fourth — the chevron then sits over that fourth, fading card.
// Card heights vary (action buttons, error messages), so the cap is measured
// from the fourth card's position rather than hardcoded.
const VISIBLE_CARDS = 3
const FADE_HEIGHT_PX = 96 // matches the h-24 gradient; aligns its top to card #4
const SCROLL_STEP_PX = 400
const BOTTOM_THRESHOLD_PX = 24

function ScrollFadeArea({
  count,
  label,
  children,
}: {
  count: number
  label: string
  children: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [maxHeight, setMaxHeight] = useState<number | null>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [atBottom, setAtBottom] = useState(true)

  const recompute = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const cards = scroller.querySelectorAll<HTMLElement>('[data-kanban-card]')
    if (cards.length > VISIBLE_CARDS) {
      // Cap the scroll viewport so the fourth card's top aligns with the top of
      // the fade gradient: three crisp cards, then the fourth fades out.
      const fourth = cards[VISIBLE_CARDS]
      const offsetWithin =
        fourth.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop
      const cap = Math.round(offsetWithin + FADE_HEIGHT_PX)
      setMaxHeight(cap)
      setHasOverflow(true)
      setAtBottom(
        scroller.scrollTop + cap >= scroller.scrollHeight - BOTTOM_THRESHOLD_PX,
      )
    } else {
      setMaxHeight(null)
      setHasOverflow(false)
      setAtBottom(true)
    }
  }, [])

  // Recheck when the card set changes.
  useEffect(() => {
    recompute()
  }, [count, recompute])

  // ResizeObserver on the content catches card-height changes (status flips that
  // add/remove action buttons) and viewport resizes, re-measuring the cap.
  useEffect(() => {
    const node = contentRef.current
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
    scrollRef.current?.scrollBy({ top: SCROLL_STEP_PX, behavior: 'smooth' })
  }, [])

  const showFade = hasOverflow && !atBottom

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={maxHeight != null ? { maxHeight } : undefined}
        className="overflow-y-auto pb-16 pr-1 scrollbar-none"
      >
        <div ref={contentRef}>{children}</div>
      </div>

      {showFade ? (
        <button
          type="button"
          aria-label={`Scroll ${label} column down`}
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
  )
}

function KanbanColumn({
  columnId,
  label,
  cards,
  onAnswerClick,
  onCodeClick,
}: {
  columnId: KanbanColumnId
  label: string
  cards: ApplicationRecord[]
  onAnswerClick?: (app: ApplicationRecord) => void
  onCodeClick?: (app: ApplicationRecord) => void
}) {
  const color = STATUS_CONFIG[columnId].color

  return (
    <div
      className="flex min-w-0 flex-col gap-2 border-t-[3px] pt-3"
      style={{ borderTopColor: color }}
    >
      <div className="flex items-center gap-2 px-0.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
        <span className="font-mono text-[10px] text-[#444]">{cards.length}</span>
      </div>
      <ScrollFadeArea count={cards.length} label={label}>
        <div className="flex flex-col gap-2">
          {cards.length === 0 ? (
            <p className="py-8 text-center font-mono text-[#333]">—</p>
          ) : (
            cards.map((app) => (
              <KanbanCard
                key={app.id}
                app={app}
                onAnswerClick={onAnswerClick}
                onCodeClick={onCodeClick}
              />
            ))
          )}
        </div>
      </ScrollFadeArea>
    </div>
  )
}

function KanbanCard({
  app,
  onAnswerClick,
  onCodeClick,
}: {
  app: ApplicationRecord
  onAnswerClick?: (app: ApplicationRecord) => void
  onCodeClick?: (app: ApplicationRecord) => void
}) {
  const portal = detectPortalFromUrl(app.job_url)
  const ts = app.applied_at ?? app.created_at ?? null

  return (
    <article
      data-kanban-card
      className="glass-card rounded-xl border border-white/[0.06] p-3"
    >
      <p className="truncate text-sm font-semibold text-white">
        {app.company || 'Unknown company'}
      </p>
      <p className="mt-0.5 truncate text-xs text-[#666]">{app.role || 'Role'}</p>

      <ApplicationOutcomeChip app={app} />

      {app.status === 'needs_attention' ? (
        <button
          type="button"
          onClick={() => onAnswerClick?.(app)}
          className="mt-2 w-full rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/10 py-1.5 font-label text-[11px] font-semibold text-[#f59e0b] transition-colors hover:bg-[#f59e0b]/15"
        >
          Answer Required
        </button>
      ) : null}

      {app.status === 'awaiting_code' ? (
        <button
          type="button"
          onClick={() => onCodeClick?.(app)}
          className="mt-2 w-full rounded-lg border border-[#22d3ee]/25 bg-[#22d3ee]/10 py-1.5 font-label text-[11px] font-semibold text-[#22d3ee] transition-colors hover:bg-[#22d3ee]/15"
        >
          Enter Email Code
        </button>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <PortalBadge portal={portal} />
        {ts ? (
          <span className="shrink-0 font-mono text-xs text-[#444]">
            {formatRelativeTime(ts)}
          </span>
        ) : (
          <span className="font-mono text-xs text-[#333]">—</span>
        )}
      </div>
    </article>
  )
}

function KanbanSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-3 w-40 animate-pulse rounded bg-white/[0.05]" />
      <div className="hidden gap-3 lg:grid lg:grid-cols-5">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className="min-h-[100px] animate-pulse border-t-[3px] border-white/[0.06] pt-3"
          >
            <div className="mb-3 h-3 w-16 rounded bg-white/[0.05]" />
            <div className="h-20 rounded-xl bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  )
}
