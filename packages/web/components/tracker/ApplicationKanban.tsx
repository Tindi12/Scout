'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown, ExternalLink, X } from 'lucide-react'

import { useNotificationsContext } from '@/contexts/notifications-context'
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
import { RetryApplicationButton } from '@/components/tracker/RetryApplicationButton'
import {
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  detectPortalFromUrl,
  formatRelativeTime,
  isManualApplyRecommended,
  isRetryableApplication,
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
  onRetry?: (app: ApplicationRecord) => Promise<void> | void
}

export function ApplicationKanban({
  apps,
  loading = false,
  onRetry,
}: ApplicationKanbanProps) {
  const { isApplicationDismissed, dismissForApplication } =
    useNotificationsContext()

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
      // X-ed attention cards stay dismissed (server-persisted, same mechanism
      // as the live feed) — drop them from the board.
      if (status === 'needs_attention' && isApplicationDismissed(app.id)) {
        continue
      }
      if (status in map) {
        map[status].push(app)
      } else if (app.status === 'awaiting_code') {
        // Agent-internal verifying state: Scout retrieves the emailed code
        // itself, so this is just a live in-progress application.
        map.in_progress.push(app)
      } else {
        map.queued.push(app)
      }
    }
    return map
  }, [apps, isApplicationDismissed])

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
            onRetry={onRetry}
            onDismissAttention={(app) => void dismissForApplication(app.id)}
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
                      onRetry={onRetry}
                      onDismissAttention={(a) => void dismissForApplication(a.id)}
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
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-[#1a1a1a] text-white shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition-all duration-200 group-hover:translate-y-0.5 group-hover:border-primary/40 group-hover:bg-primary">
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
  onRetry,
  onDismissAttention,
}: {
  columnId: KanbanColumnId
  label: string
  cards: ApplicationRecord[]
  onRetry?: (app: ApplicationRecord) => Promise<void> | void
  onDismissAttention?: (app: ApplicationRecord) => void
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
                onRetry={onRetry}
                onDismissAttention={onDismissAttention}
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
  onRetry,
  onDismissAttention,
}: {
  app: ApplicationRecord
  onRetry?: (app: ApplicationRecord) => Promise<void> | void
  onDismissAttention?: (app: ApplicationRecord) => void
}) {
  const portal = detectPortalFromUrl(app.job_url)
  // applications.created_at is frozen at the row's ORIGINAL creation and goes
  // stale across a retry (same row reused for a new attempt) — status_changed_at
  // (derived from this application's most recent notification) reflects the
  // CURRENT attempt instead. See tracker-utils.ts's ApplicationRecord doc.
  const ts = app.applied_at ?? app.status_changed_at ?? app.created_at ?? null

  return (
    <article
      data-kanban-card
      className="glass-card rounded-xl border border-white/[0.06] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-white">
          {app.company || 'Unknown company'}
        </p>
        {isRetryableApplication(app) && onRetry ? (
          <RetryApplicationButton
            className="-mr-0.5 -mt-0.5"
            onRetry={() => onRetry(app)}
          />
        ) : null}
        {app.status === 'needs_attention' && onDismissAttention ? (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismissAttention(app)}
            className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#555] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-xs text-[#666]">{app.role || 'Role'}</p>

      <ApplicationOutcomeChip app={app} />

      {isManualApplyRecommended(app) && app.job_url ? (
        <a
          href={app.job_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#f59e0b]/25 bg-[#f59e0b]/[0.08] px-2 py-1 font-label text-[11px] font-medium text-[#f59e0b] transition-colors hover:border-[#f59e0b]/50 hover:bg-[#f59e0b]/[0.14]"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
          Apply manually
        </a>
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
