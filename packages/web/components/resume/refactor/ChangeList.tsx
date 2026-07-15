'use client'

import { motion } from 'framer-motion'
import { Check, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

import { InlineDiff } from './InlineDiff'
import { useRefactor } from './RefactorContext'
import { ScoutLogo } from './ScoutLogo'
import type { ResumeChange } from './types'

function ChangeCard({ change }: { change: ResumeChange }) {
  const { selected, selectChange, setChangeStatus } = useRefactor()
  const isSelected = selected?.id === change.id
  const ignored = change.status === 'ignored'

  return (
    <motion.div
      layout
      data-change-card-id={change.id}
      onClick={() => selectChange(change.id, 'list')}
      animate={{ opacity: ignored ? 0.55 : 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      className={`cursor-pointer rounded-xl border bg-white/[0.04] p-4 backdrop-blur-md transition-colors ${
        isSelected
          ? 'border-[#FF6733]/60'
          : ignored
            ? 'border-white/[0.08] hover:border-white/[0.16]'
            : 'border-green-500/25 hover:border-green-500/50'
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          selectChange(change.id, 'list')
        }
      }}
    >
      <header className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2">
          <ScoutLogo
            className={`h-3.5 w-3.5 ${ignored ? 'text-[#777]' : 'text-green-400'}`}
          />
          <span
            className={`font-label text-[10px] font-semibold uppercase tracking-[0.16em] ${
              ignored ? 'text-[#777]' : 'text-green-400'
            }`}
          >
            {ignored ? 'Kept original' : 'Applied'}
          </span>
        </span>
        <span className="truncate font-mono text-[10px] text-[#555]">
          {change.group}
        </span>
      </header>

      <div className="mt-3">
        <InlineDiff before={change.original} after={change.rewritten} />
      </div>

      <footer className="mt-3 flex items-center gap-2">
        {ignored ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setChangeStatus(change.id, 'applied')
              selectChange(change.id, 'list')
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-1 font-body text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20"
          >
            <Check className="h-3 w-3" strokeWidth={2.5} />
            Apply fix
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setChangeStatus(change.id, 'ignored')
              selectChange(change.id, 'list')
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-body text-xs text-[#888] transition-colors hover:text-white"
          >
            <Undo2 className="h-3 w-3" strokeWidth={2} />
            Keep original
          </button>
        )}
      </footer>
    </motion.div>
  )
}

/**
 * Sidebar of everything Scout changed, grouped by company/project.
 * Clicking a card scrolls the preview to the exact bullet; selecting a
 * bullet in the preview scrolls the matching card into view here.
 */
export function ChangeList() {
  const { changes, appliedCount, selected } = useRefactor()
  const listRef = useRef<HTMLDivElement | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, ResumeChange[]>()
    for (const change of changes) {
      const list = map.get(change.group) ?? []
      list.push(change)
      map.set(change.group, list)
    }
    return Array.from(map.entries())
  }, [changes])

  // When the preview initiates a selection, bring the matching card into view.
  useEffect(() => {
    if (!selected || selected.source !== 'preview' || !listRef.current) return
    const card = listRef.current.querySelector(
      `[data-change-card-id="${selected.id}"]`,
    )
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selected])

  return (
    <div ref={listRef} className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <p className="font-label text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF6733]">
          What Scout Changed
        </p>
        <p className="font-mono text-[11px] tabular-nums text-[#666]">
          {appliedCount}/{changes.length} applied
        </p>
      </header>

      {changes.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5 text-center backdrop-blur-md">
          <p className="font-body text-sm text-[#999]">
            Scout kept your bullets — they were already strong.
          </p>
        </div>
      ) : (
        groups.map(([group, items]) => (
          <div key={group} className="flex flex-col gap-2.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#555]">
              {group}
            </p>
            {items.map((change) => (
              <ChangeCard key={change.id} change={change} />
            ))}
          </div>
        ))
      )}
    </div>
  )
}
