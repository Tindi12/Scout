'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { useMemo } from 'react'

import { PortalBadge } from '@/components/tracker/PortalBadge'
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
}

export function ApplicationKanban({
  apps,
  loading = false,
  onAnswerClick,
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
                    />
                  ))
                )}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </div>
  )
}

function KanbanColumn({
  columnId,
  label,
  cards,
  onAnswerClick,
}: {
  columnId: KanbanColumnId
  label: string
  cards: ApplicationRecord[]
  onAnswerClick?: (app: ApplicationRecord) => void
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
      <div className="flex flex-col gap-2">
        {cards.length === 0 ? (
          <p className="py-8 text-center font-mono text-[#333]">—</p>
        ) : (
          cards.map((app) => (
            <KanbanCard key={app.id} app={app} onAnswerClick={onAnswerClick} />
          ))
        )}
      </div>
    </div>
  )
}

function KanbanCard({
  app,
  onAnswerClick,
}: {
  app: ApplicationRecord
  onAnswerClick?: (app: ApplicationRecord) => void
}) {
  const portal = detectPortalFromUrl(app.job_url)
  const ts = app.applied_at ?? app.created_at ?? null

  return (
    <article className="glass-card rounded-xl border border-white/[0.06] p-3">
      <p className="truncate text-sm font-semibold text-white">
        {app.company || 'Unknown company'}
      </p>
      <p className="mt-0.5 truncate text-xs text-[#666]">{app.role || 'Role'}</p>

      {app.status === 'failed' && app.error_message ? (
        <p className="mt-1.5 truncate text-[10px] text-[#ef4444]">
          {app.error_message}
        </p>
      ) : null}

      {app.status === 'needs_attention' ? (
        <button
          type="button"
          onClick={() => onAnswerClick?.(app)}
          className="mt-2 w-full rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/10 py-1.5 font-label text-[11px] font-semibold text-[#f59e0b] transition-colors hover:bg-[#f59e0b]/15"
        >
          Answer Required
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
