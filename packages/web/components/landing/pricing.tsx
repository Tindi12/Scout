import Link from 'next/link'
import { Check } from 'lucide-react'

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
  { label: '3x higher application volume', emphasis: true },
  { label: 'Dedicated support queue' },
  { label: 'Early access to new features' },
  { label: 'Advanced analytics dashboard' },
]

function FeatureRow({ feature }: { feature: Feature }) {
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

export function Pricing() {
  return (
    <section id="pricing" className="relative px-6 py-32 lg:px-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 mx-auto h-[400px] max-w-3xl -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,103,51,0.08) 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />

      <div className="mx-auto mb-16 max-w-3xl text-center">
        <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
          Pricing
        </p>
        <h2 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl">
          Three tiers. One goal: get you hired.
        </h2>
        <p className="mt-5 font-body text-[17px] text-[#A1A1AA]">
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
            25 lifetime applications
          </p>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
            Perfect for trying Scout&apos;s resume intelligence before you let
            the agent loose.
          </p>

          <Link
            href="/sign-up"
            prefetch
            className="font-label mt-7 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-white/[0.1] active:scale-[0.97]"
          >
            Start Free
          </Link>

          <div className="my-7 h-px w-full bg-white/10" />

          <ul className="space-y-3.5">
            {FREE_FEATURES.map((f) => (
              <FeatureRow key={f.label} feature={f} />
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div
          className="relative flex flex-col rounded-2xl p-8"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 103, 51, 0.4)',
            boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="absolute -top-3 right-6">
            <div className="font-label inline-flex items-center gap-1.5 rounded-full bg-[#FF6733] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-[0_0_20px_rgba(255,103,51,0.5)]">
              Unfair Advantage
            </div>
          </div>

          <div className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FF6733]">
            Pro
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-headline text-5xl font-semibold tracking-[-0.04em] text-white">
              $5.99
            </span>
            <span className="font-body text-lg text-[#A1A1AA]">/month</span>
          </div>
          <p className="mt-1 font-body text-sm text-[#A1A1AA]">
            200 applications / 30 days
          </p>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
            Unleash the full agent. Tailored resumes for every role, applied
            autonomously while you sleep.
          </p>

          <Link
            href="/sign-up"
            prefetch
            className="font-label mt-7 inline-flex items-center justify-center rounded-full bg-[#FF6733] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.4)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(255,103,51,0.6)] active:scale-[0.97]"
          >
            Upgrade to Pro
          </Link>

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
            <div className="font-label inline-flex items-center gap-1.5 rounded-full bg-[#FF6733] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-[0_0_20px_rgba(255,103,51,0.5)]">
              Power User
            </div>
          </div>

          <div className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FF6733]">
            Scout+
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-headline text-5xl font-semibold tracking-[-0.04em] text-white">
              $14.99
            </span>
            <span className="font-body text-lg text-[#A1A1AA]">/month</span>
          </div>
          <p className="mt-1 font-body text-sm text-[#A1A1AA]">
            600 applications / 30 days
          </p>
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
            Maximum volume, priority support, and first access when Scout ships
            something new.
          </p>

          <Link
            href="/sign-up"
            prefetch
            className="font-label mt-7 inline-flex items-center justify-center rounded-full bg-[#FF6733] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.4)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(255,103,51,0.6)] active:scale-[0.97]"
          >
            Upgrade to Scout+
          </Link>

          <div className="my-7 h-px w-full bg-white/10" />

          <ul className="space-y-3.5">
            {SCOUT_PLUS_FEATURES.map((f) => (
              <FeatureRow key={f.label} feature={f} />
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-12 flex justify-center">
        <Link
          href="/pricing"
          className="font-label group inline-flex items-center gap-1.5 text-sm font-medium text-[#A1A1AA] transition-colors duration-200 hover:text-white"
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
