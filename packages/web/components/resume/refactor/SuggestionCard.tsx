'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Check, Undo2 } from 'lucide-react'

import { ScoutLogo } from './ScoutLogo'
import type { ResumeSuggestion, SuggestionSeverity } from './types'

interface SeverityStyle {
  accent: string
  border: string
  label: string
}

const SEVERITY: Record<SuggestionSeverity, SeverityStyle> = {
  critical: {
    accent: 'text-red-400',
    border: 'border-red-500/40',
    label: 'Critical',
  },
  warning: {
    accent: 'text-amber-400',
    border: 'border-amber-500/40',
    label: 'Warning',
  },
  suggestion: {
    accent: 'text-[#FF6733]',
    border: 'border-[#FF6733]/40',
    label: 'Suggestion',
  },
}

const APPLIED: SeverityStyle = {
  accent: 'text-green-400',
  border: 'border-green-500/40',
  label: 'Applied',
}

interface SuggestionCardProps {
  suggestion: ResumeSuggestion
  /** True once Scout's rewrite has run — every open suggestion reads as fixed. */
  fixed: boolean
  onToggleDismiss: (id: string) => void
  /** Launches the rewrite (fixes everything); hidden when unavailable. */
  onFix?: () => void
}

function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase()
}

export function SuggestionCard({
  suggestion,
  fixed,
  onToggleDismiss,
  onFix,
}: SuggestionCardProps) {
  const ignored = suggestion.status === 'ignored'
  const style = fixed && !ignored ? APPLIED : SEVERITY[suggestion.severity]

  return (
    <motion.article
      layout
      animate={{ opacity: ignored ? 0.45 : 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      className={`rounded-xl border ${style.border} bg-white/[0.04] p-5 backdrop-blur-md md:p-6`}
    >
      <header className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2">
          <ScoutLogo className={`h-[18px] w-[18px] ${style.accent}`} />
          <span
            className={`font-label text-[11px] font-semibold uppercase tracking-[0.18em] ${style.accent}`}
          >
            {ignored ? 'Dismissed' : style.label}
          </span>
        </span>
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-[#555]">
          {typeLabel(suggestion.type)}
        </span>
      </header>

      <p className="mt-3.5 font-body text-[15px] font-medium leading-relaxed text-white">
        {suggestion.message}
      </p>

      {suggestion.suggestion ? (
        <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/30 px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#666]">
            How Scout will fix it
          </p>
          <p className="mt-1.5 font-body text-sm leading-relaxed text-[#cfcfcf]">
            {suggestion.suggestion}
          </p>
        </div>
      ) : null}

      <footer className="mt-4 flex items-center gap-2.5">
        {fixed && !ignored ? (
          <span className="inline-flex items-center gap-1.5 font-body text-xs text-green-400">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Fixed in your refactored resume
          </span>
        ) : (
          <>
            {onFix && !ignored ? (
              <button
                type="button"
                onClick={onFix}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 font-body text-xs font-medium text-white transition-colors hover:border-white/[0.2] hover:bg-white/[0.1]"
              >
                Fix with Scout
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onToggleDismiss(suggestion.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-xs text-[#888] transition-colors hover:text-white"
            >
              {ignored ? (
                <>
                  <Undo2 className="h-3 w-3" strokeWidth={2} />
                  Restore
                </>
              ) : (
                'Ignore'
              )}
            </button>
          </>
        )}
      </footer>
    </motion.article>
  )
}
