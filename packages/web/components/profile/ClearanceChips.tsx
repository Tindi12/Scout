'use client'

import { Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

interface ClearanceChipsProps {
  id?: string
  values: string[]
  onChange: (next: string[]) => void
}

const QUICK_CHIPS = [
  'Secret',
  'Top Secret',
  'TS/SCI',
  'TS/SCI with Polygraph',
  'Public Trust',
  'Confidential',
]

export function ClearanceChips({ id, values, onChange }: ClearanceChipsProps) {
  const [draft, setDraft] = useState('')

  const commitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, trimmed])
    setDraft('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraft()
      return
    }
    if (event.key === 'Backspace' && draft.length === 0 && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  const remove = (target: string) => {
    onChange(values.filter((value) => value !== target))
  }

  const remainingQuickChips = QUICK_CHIPS.filter(
    (chip) => !values.some((v) => v.toLowerCase() === chip.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-all focus-within:border-primary/60 focus-within:bg-white/[0.05]">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6733]/30 bg-[#FF6733]/10 px-2.5 py-1 text-xs text-white"
          >
            {value}
            <button
              type="button"
              onClick={() => remove(value)}
              aria-label={`Remove ${value}`}
              className="text-white/60 transition-colors hover:text-white"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={
            values.length === 0
              ? 'Add a clearance and press Enter'
              : 'Add another'
          }
          className="font-body min-w-[140px] flex-1 bg-transparent py-1 text-sm text-white placeholder:text-[#555] focus:outline-none"
        />
      </div>
      {remainingQuickChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {remainingQuickChips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChange([...values, chip])}
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-[#888] transition-colors hover:border-white/15 hover:bg-white/[0.04] hover:text-white"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
