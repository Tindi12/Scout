'use client'

import { Check } from 'lucide-react'

import { SecuredByStripe } from '@/components/billing/SecuredByStripe'
import { PlanCta, type Viewer } from '@/components/pricing/PlanCta'
import {
  PRICING_TIERS,
  type PricingFeature,
  type PricingTier,
} from '@/components/pricing/tiers'

function FeatureRow({ feature }: { feature: PricingFeature }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-inset ring-white/10">
        <Check className="h-3 w-3 text-[#FF6733]" strokeWidth={2.5} />
      </span>
      <span
        className={`font-body text-[14.5px] leading-relaxed ${
          feature.emphasis ? 'font-medium text-white' : 'text-[#A1A1AA]'
        }`}
      >
        {feature.label}
      </span>
    </li>
  )
}

function Card({ tier, viewer }: { tier: PricingTier; viewer: Viewer }) {
  const popular = Boolean(tier.popular)
  return (
    <div
      className={
        popular
          ? 'relative flex flex-col rounded-2xl p-8'
          : 'glass-card relative flex flex-col rounded-2xl p-8'
      }
      style={
        popular
          ? {
              background: 'rgba(255, 255, 255, 0.04)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 103, 51, 0.4)',
              boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
            }
          : undefined
      }
    >
      {popular ? (
        <div className="absolute -top-3 right-6">
          <div className="font-label inline-flex items-center gap-1.5 rounded-full bg-[#FF6733] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-[0_0_20px_rgba(255,103,51,0.5)]">
            Popular
          </div>
        </div>
      ) : null}

      <div
        className={`font-label text-[11px] font-semibold uppercase tracking-[0.2em] ${
          popular ? 'text-[#FF6733]' : 'text-[#888888]'
        }`}
      >
        {tier.name}
      </div>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="font-headline text-5xl font-semibold tracking-[-0.04em] text-white">
          {tier.price}
        </span>
        <span className="font-body text-lg text-[#A1A1AA]">{tier.period}</span>
      </div>
      <p className="mt-1 font-body text-sm text-[#A1A1AA]">{tier.limitLine}</p>
      <p className="mt-3 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
        {tier.blurb}
      </p>

      <div className="mt-7">
        <PlanCta tierId={tier.id} viewer={viewer} placement="card" />
      </div>
      {tier.id !== 'free' ? (
        <div className="mt-3 flex justify-center">
          <SecuredByStripe />
        </div>
      ) : null}

      <div className="my-7 h-px w-full bg-white/10" />

      <ul className="space-y-3.5">
        {tier.features.map((f) => (
          <FeatureRow key={f.label} feature={f} />
        ))}
      </ul>
    </div>
  )
}

export function PricingCards({ viewer }: { viewer: Viewer }) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
      {PRICING_TIERS.map((tier) => (
        <Card key={tier.id} tier={tier} viewer={viewer} />
      ))}
    </div>
  )
}
