'use client'

import { Check, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ProfileProgressProps {
  percentage: number
  fieldsComplete: number
  fieldsTotal: number
  missingFieldLabels?: string[]
}

const RING_SIZE = 64
const STROKE_WIDTH = 6

const RING_COLOR_START = { r: 255, g: 103, b: 51 } // #FF6733
const RING_COLOR_END = { r: 34, g: 197, b: 94 } // #22c55e

function ringColor(value: number): string {
  const t = Math.max(0, Math.min(100, value)) / 100
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
  const r = lerp(RING_COLOR_START.r, RING_COLOR_END.r)
  const g = lerp(RING_COLOR_START.g, RING_COLOR_END.g)
  const b = lerp(RING_COLOR_START.b, RING_COLOR_END.b)
  return `rgb(${r}, ${g}, ${b})`
}

export function ProfileProgress({
  percentage,
  fieldsComplete,
  fieldsTotal,
  missingFieldLabels = [],
}: ProfileProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)))
  const color = ringColor(clamped)
  const radius = RING_SIZE / 2 - STROKE_WIDTH / 2 - 1
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const cx = RING_SIZE / 2
  const cy = RING_SIZE / 2

  const unlocked = clamped >= 80
  const showChecklist = clamped < 100 && missingFieldLabels.length > 0

  return (
    <section className="glass-card rounded-2xl border border-white/[0.06] p-6 md:p-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div
          className="relative inline-flex shrink-0 items-center justify-center"
          style={{
            width: RING_SIZE,
            height: RING_SIZE,
            filter: `drop-shadow(0 0 18px ${color}40)`,
          }}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            aria-hidden
          >
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={STROKE_WIDTH}
            />
            <g transform={`rotate(-90 ${cx} ${cy})`}>
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 400ms ease-out, stroke 250ms ease-out' }}
              />
            </g>
          </svg>
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-headline text-sm font-semibold tabular-nums text-white"
          >
            {clamped}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-headline text-lg font-medium tracking-tight text-white">
              Profile Strength
            </h2>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
                unlocked
                  ? 'border border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]'
                  : 'border border-[#FF6733]/30 bg-primary/10 text-[#FF6733]',
              )}
            >
              {unlocked ? (
                <>
                  <Sparkles className="h-3 w-3" strokeWidth={2} />
                  Scout Agent Unlocked
                </>
              ) : (
                'Complete profile to unlock Scout'
              )}
            </span>
          </div>
          <p className="text-sm text-[#888]">
            {fieldsComplete} of {fieldsTotal} fields complete
          </p>
          {!unlocked && (
            <p className="text-xs text-[#555]">
              Scout needs this info to apply on your behalf
            </p>
          )}
        </div>
      </div>

      {showChecklist && (
        <div className="mt-5 border-t border-white/[0.05] pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#444]">
            Still missing
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {missingFieldLabels.map((label) => (
              <li
                key={label}
                className="flex items-center gap-2 text-xs text-[#888]"
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60"
                />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unlocked && missingFieldLabels.length === 0 && (
        <div className="mt-5 flex items-center gap-2 border-t border-white/[0.05] pt-4 text-xs text-[#666]">
          <Check className="h-3.5 w-3.5 text-[#22c55e]" strokeWidth={2.5} />
          Every required field is filled. Scout is ready to apply on your behalf.
        </div>
      )}
    </section>
  )
}
