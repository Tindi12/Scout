'use client'

import { motion } from 'framer-motion'
import { BarChart3, Briefcase, Layout, Tag } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

interface BreakdownCardProps {
  breakdown: {
    experience: number
    metrics: number
    structure: number
    keywords: number
  }
}

type DimensionKey = keyof BreakdownCardProps['breakdown']

interface Row {
  key: DimensionKey
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const ROWS: Row[] = [
  { key: 'experience', label: 'Experience Quality', Icon: Briefcase },
  { key: 'metrics', label: 'Metrics & Impact', Icon: BarChart3 },
  { key: 'structure', label: 'Structure', Icon: Layout },
  { key: 'keywords', label: 'Keywords', Icon: Tag },
]

const MAX_PER_DIMENSION = 25

function clamp25(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(MAX_PER_DIMENSION, value))
}

function dimColor(percent: number): string {
  if (percent >= 70) return '#22c55e'
  if (percent >= 40) return '#f59e0b'
  return '#ef4444'
}

export function BreakdownCard({ breakdown }: BreakdownCardProps) {
  return (
    <section
      className="glass-card relative overflow-hidden rounded-2xl p-6 md:p-7"
      aria-label="Score breakdown"
    >
      <div className="relative">
        <p className="font-label text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF6733]">
          Score Breakdown
        </p>

        <div className="mt-5 flex flex-col">
          {ROWS.map(({ key, label, Icon }, index) => {
            const score = clamp25(breakdown[key] ?? 0)
            const percent = (score / MAX_PER_DIMENSION) * 100
            const fill = dimColor(percent)

            return (
              <div
                key={key}
                className={
                  index === 0
                    ? 'flex flex-col gap-2.5 pb-5'
                    : 'flex flex-col gap-2.5 border-t border-white/[0.04] py-5 last:pb-0'
                }
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md">
                    <Icon
                      className="h-[18px] w-[18px] text-white/80"
                      strokeWidth={1.75}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <span className="truncate font-body text-sm text-white">
                      {label}
                    </span>
                    <span className="shrink-0 font-body text-sm font-medium tabular-nums text-white/90">
                      {Math.round(score)}
                      <span className="ml-0.5 font-normal text-[#666]">
                        {' '}
                        / {MAX_PER_DIMENSION}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{
                      duration: 1,
                      ease: 'easeOut',
                      delay: index * 0.15,
                    }}
                    style={{
                      backgroundColor: fill,
                      boxShadow: `0 0 12px ${fill}55`,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
