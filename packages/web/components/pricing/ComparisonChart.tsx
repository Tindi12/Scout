'use client'

import { Check, Minus } from 'lucide-react'

import { PlanCta, type Viewer } from '@/components/pricing/PlanCta'
import {
  COMPARISON_GROUPS,
  PRICING_TIERS,
  type ComparisonValue,
} from '@/components/pricing/tiers'

const GRID = 'grid grid-cols-[minmax(180px,1.7fr)_repeat(3,minmax(96px,1fr))]'

function ValueCell({ value }: { value: ComparisonValue }) {
  if (value === true) {
    return (
      <span className="flex items-center justify-center">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF6733]/15 ring-1 ring-inset ring-[#FF6733]/30">
          <Check className="h-3 w-3 text-[#FF6733]" strokeWidth={3} />
        </span>
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="flex items-center justify-center">
        <Minus className="h-4 w-4 text-[#444]" strokeWidth={2} aria-hidden />
        <span className="sr-only">Not included</span>
      </span>
    )
  }
  return (
    <span className="text-center font-body text-[13px] text-[#e8e8e8]">
      {value}
    </span>
  )
}

export function ComparisonChart({ viewer }: { viewer: Viewer }) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 text-center">
        <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
          Compare plans
        </p>
        <h2 className="mt-3 font-headline text-3xl font-medium tracking-[-0.03em] text-white md:text-4xl">
          Every feature, side by side
        </h2>
      </div>

      <div className="glass-card overflow-x-auto rounded-2xl">
        <div className="min-w-[640px]">
          {/* Tier header row */}
          <div className={`${GRID} items-end gap-x-4 border-b border-white/[0.08] px-6 py-6`}>
            <div className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-[#888]">
              Features
            </div>
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`flex flex-col items-center gap-2 ${
                  tier.popular
                    ? 'rounded-xl bg-[#FF6733]/[0.04] px-2 pb-1 pt-2'
                    : ''
                }`}
              >
                <div className="text-center">
                  <div
                    className={`font-label text-sm font-semibold ${
                      tier.popular ? 'text-[#FF6733]' : 'text-white'
                    }`}
                  >
                    {tier.name}
                  </div>
                  <div className="font-body text-[12px] text-[#888]">
                    {tier.price === '$0' ? 'Free' : `${tier.price}${tier.period}`}
                  </div>
                </div>
                <PlanCta tierId={tier.id} viewer={viewer} placement="chart" />
              </div>
            ))}
          </div>

          {/* Grouped feature rows */}
          {COMPARISON_GROUPS.map((group) => (
            <div key={group.category}>
              <div className="bg-white/[0.02] px-6 py-3">
                <span className="font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A1A1AA]">
                  {group.category}
                </span>
              </div>
              {group.rows.map((row) => (
                <div
                  key={row.label}
                  className={`${GRID} items-center gap-x-4 border-t border-white/[0.04] px-6 py-3.5`}
                >
                  <div className="font-body text-[13.5px] leading-snug text-[#cfcfcf]">
                    {row.label}
                  </div>
                  <ValueCell value={row.free} />
                  <ValueCell value={row.pro} />
                  <ValueCell value={row.scoutPlus} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
