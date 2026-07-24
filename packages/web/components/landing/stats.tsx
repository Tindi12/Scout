'use client'

import { useInView } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  STAT_SEEDS,
  type PlatformStats,
} from '@/lib/landing-stats'

import { FlipNumber } from './flip-number'

function StatCard({
  metric,
  label,
  sublabel,
}: {
  metric: ReactNode
  label: string
  sublabel?: string
}) {
  return (
    <article className="flex h-full flex-col items-center rounded-2xl border border-white/[0.08] bg-[#0c0c0c] px-4 py-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:px-5 sm:py-6">
      <div className="flex min-h-[4.75rem] w-full flex-col items-center justify-center sm:min-h-[5.25rem]">
        {metric}
      </div>
      <p className="mt-2.5 text-center font-label text-[11px] font-medium uppercase tracking-[0.16em] text-[#888888] sm:text-[12px]">
        {label}
      </p>
      <p className="mt-1 min-h-[1rem] text-center font-body text-[11px] text-[#666666]">
        {sublabel ?? '\u00a0'}
      </p>
    </article>
  )
}

export function Stats({ stats }: { stats: PlatformStats }) {
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, {
    once: true,
    amount: 0.35,
    margin: '0px 0px -6% 0px',
  })
  const [live, setLive] = useState(stats)

  // Keep targets fresh while the visitor stays on the page.
  useEffect(() => {
    if (!inView) return

    let cancelled = false
    const refresh = async () => {
      try {
        const res = await fetch('/api/landing/stats', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const next = (await res.json()) as PlatformStats
        if (!cancelled) setLive(next)
      } catch {
        // Stay on the last known paced totals.
      }
    }

    const id = window.setInterval(refresh, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [inView])

  // If the server re-renders with newer props, raise targets (never drop).
  useEffect(() => {
    setLive((prev) => ({
      applicationsAutomated: Math.max(
        prev.applicationsAutomated,
        stats.applicationsAutomated,
      ),
      resumesOptimized: Math.max(prev.resumesOptimized, stats.resumesOptimized),
      hoursSaved: Math.max(prev.hoursSaved, stats.hoursSaved),
    }))
  }, [stats])

  return (
    <section
      ref={sectionRef}
      className="relative px-4 py-14 sm:px-6 sm:py-20 lg:px-12 lg:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-14 md:mb-16">
          <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
            Our statistics
          </p>
          <h2 className="mt-3 font-headline text-[1.65rem] font-medium tracking-[-0.03em] text-white sm:mt-4 sm:text-4xl md:text-5xl">
            The numbers don&apos;t lie.
          </h2>
          <p className="mt-3 font-body text-[15px] leading-relaxed text-[#A1A1AA] sm:mt-5 sm:text-[17px]">
            Live from Scout&apos;s platform — applications automated, resumes
            optimized, and hours saved as Scout keeps working.
          </p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-3 sm:gap-4 md:grid-cols-3">
          <StatCard
            label="Applications Automated"
            metric={
              <FlipNumber
                seed={STAT_SEEDS.applicationsAutomated}
                target={live.applicationsAutomated}
                active={inView}
                ariaLabel={`${live.applicationsAutomated.toLocaleString('en-US')} applications automated`}
              />
            }
          />

          <StatCard
            label="Resumes Optimized"
            metric={
              <FlipNumber
                seed={STAT_SEEDS.resumesOptimized}
                target={live.resumesOptimized}
                active={inView}
                ariaLabel={`${live.resumesOptimized.toLocaleString('en-US')} resumes optimized`}
              />
            }
          />

          <StatCard
            label="Hours Saved"
            sublabel="Across Scout users"
            metric={
              <FlipNumber
                seed={STAT_SEEDS.hoursSaved}
                target={live.hoursSaved}
                unit="+"
                active={inView}
                ariaLabel={`${live.hoursSaved.toLocaleString('en-US')}+ hours saved`}
              />
            }
          />
        </div>
      </div>
    </section>
  )
}
