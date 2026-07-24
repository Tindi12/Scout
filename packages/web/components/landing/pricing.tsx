import Link from 'next/link'
import { Check } from 'lucide-react'

import { ComingSoonCta } from '@/components/landing/waitlist'
import { Button } from '@/components/ui/button'
import { isWaitlistMode } from '@/lib/waitlist-mode'

type Feature = { label: string; emphasis?: boolean }

const FREE_FEATURES: Feature[] = [
  { label: 'Resume parsing & Scout Score' },
  { label: 'AI weakness diagnosis' },
  { label: 'Browse matched internships' },
  { label: 'Limited Scout AI Copilot messages' },
  { label: 'Manual application links' },
]

const PRO_FEATURES: Feature[] = [
  { label: 'Everything in Free, plus:' },
  { label: 'Job-specific resume rewrites', emphasis: true },
  { label: 'Autonomous auto-apply via Scout Agent', emphasis: true },
  { label: 'LaTeX Jake-format PDF resumes' },
  { label: 'Unlimited Scout AI Copilot messages' },
  { label: 'Live Kanban application tracker' },
  { label: '7-day automated follow-up emails' },
  { label: 'Priority pgvector job matching' },
]

const SCOUT_PLUS_FEATURES: Feature[] = [
  { label: 'Everything in Pro' },
  { label: '2.5× Pro application volume', emphasis: true },
  { label: 'Dedicated support queue' },
  { label: 'Early access to new features' },
  { label: 'Advanced analytics dashboard' },
]

function FeatureRow({ feature }: { feature: Feature }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-inset ring-white/10">
        <Check className="h-3 w-3 text-primary" strokeWidth={2.5} />
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

function PricingCta({
  source,
  href,
  label,
  variant = 'default',
}: {
  source: string
  href: string
  label: string
  variant?: 'default' | 'outline'
}) {
  if (isWaitlistMode()) {
    return (
      <ComingSoonCta
        source={source}
        variant={variant}
        size="lg"
        className="mt-7 min-h-11 w-full"
      />
    )
  }
  return (
    <Button asChild variant={variant} size="lg" className="mt-7 min-h-11 w-full">
      <Link href={href} prefetch>
        {label}
      </Link>
    </Button>
  )
}

export function Pricing() {
  return (
    <section id="pricing" className="relative px-4 py-20 sm:px-6 sm:py-28 lg:px-12 lg:py-32">
      <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
        <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-primary">
          Pricing
        </p>
        <h2 className="mt-4 font-headline text-[1.85rem] font-medium tracking-[-0.03em] text-white sm:text-4xl md:text-5xl">
          Three tiers. One goal: get you hired.
        </h2>
        <p className="mt-4 font-body text-[16px] leading-relaxed text-[#A1A1AA] sm:mt-5 sm:text-[17px]">
          Start free. Upgrade when you&apos;re ready to let Scout apply on your
          behalf.
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Free */}
        <div className="glass-card relative flex flex-col rounded-2xl p-8">
          <div className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-[#888888]">
            Free
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-headline text-5xl font-semibold tracking-[-0.04em] text-white">
              $0
            </span>
            <span className="font-body text-lg text-[#A1A1AA]">forever</span>
          </div>
          <p className="mt-1 font-body text-sm text-[#A1A1AA]">
            10 lifetime applications
          </p>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
            Perfect for trying Scout&apos;s resume intelligence before you let
            the agent loose.
          </p>

          <PricingCta
            source="pricing_free"
            href="/sign-up"
            label="Start Free"
            variant="outline"
          />

          <div className="my-7 h-px w-full bg-white/10" />

          <ul className="space-y-3.5">
            {FREE_FEATURES.map((f) => (
              <FeatureRow key={f.label} feature={f} />
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div className="relative flex flex-col rounded-2xl border border-primary/40 bg-white/[0.04] p-8">
          <div className="absolute -top-3 right-6">
            <div className="font-label inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white">
              Unfair Advantage
            </div>
          </div>

          <div className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Pro
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-headline text-5xl font-semibold tracking-[-0.04em] text-white">
              $14.99
            </span>
            <span className="font-body text-lg text-[#A1A1AA]">/month</span>
          </div>
          <p className="mt-1 font-body text-sm text-[#A1A1AA]">
            40 applications / 30 days
          </p>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
            Unleash the full agent. Tailored resumes for every role, applied
            autonomously while you sleep.
          </p>

          <PricingCta source="pricing_pro" href="/sign-up" label="Upgrade to Pro" />

          <div className="my-7 h-px w-full bg-white/10" />

          <ul className="space-y-3.5">
            {PRO_FEATURES.map((f) => (
              <FeatureRow key={f.label} feature={f} />
            ))}
          </ul>
        </div>

        {/* Scout+ */}
        <div className="glass-card relative flex flex-col rounded-2xl p-8">
          <div className="absolute -top-3 right-6">
            <div className="font-label inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white">
              Power User
            </div>
          </div>

          <div className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Scout+
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-headline text-5xl font-semibold tracking-[-0.04em] text-white">
              $29.99
            </span>
            <span className="font-body text-lg text-[#A1A1AA]">/month</span>
          </div>
          <p className="mt-1 font-body text-sm text-[#A1A1AA]">
            100 applications / 30 days
          </p>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
            Maximum volume, priority support, and first access when Scout ships
            something new.
          </p>

          <PricingCta
            source="pricing_scout_plus"
            href="/sign-up"
            label="Upgrade to Scout+"
          />

          <div className="my-7 h-px w-full bg-white/10" />

          <ul className="space-y-3.5">
            {SCOUT_PLUS_FEATURES.map((f) => (
              <FeatureRow key={f.label} feature={f} />
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 flex justify-center sm:mt-12">
        <Link
          href="/pricing"
          className="font-label group inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-white"
        >
          Compare all features
          <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
            &rarr;
          </span>
        </Link>
      </div>
    </section>
  )
}
