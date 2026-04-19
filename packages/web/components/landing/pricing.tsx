import Link from 'next/link'
import { Check } from 'lucide-react'

type Feature = { label: string; emphasis?: boolean }

const STARTER_FEATURES: Feature[] = [
  { label: 'Resume parsing for PDF & DOCX' },
  { label: 'Full Scout Score with 4-dimension breakdown' },
  { label: 'Weakness diagnosis with severity tags' },
  { label: 'Browse matched internships across portals' },
  { label: '5 lifetime AI Copilot messages' },
  { label: 'Manual application links (apply yourself)' },
]

const PRO_FEATURES: Feature[] = [
  { label: 'Everything in Starter, plus:' },
  { label: 'Unlimited job-specific resume rewrites', emphasis: true },
  { label: 'Unlimited autonomous auto-apply via Scout Agent', emphasis: true },
  { label: 'LaTeX-rendered Jake-format PDFs' },
  { label: 'Full AI Copilot — unlimited streaming chat' },
  { label: 'Live application tracker (Kanban)' },
  { label: '7-day automated follow-up emails' },
  { label: 'Priority job matching with pgvector search' },
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
          Choose the plan that fits your hustle.
        </h2>
        <p className="mt-5 font-body text-[17px] text-[#A1A1AA]">
          Start free. Upgrade when you&apos;re ready to let Scout apply on your
          behalf.
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
        {/* Starter */}
        <div className="glass-card relative flex flex-col rounded-2xl p-8">
          <div className="font-label text-[11px] font-semibold uppercase tracking-[0.2em] text-[#888888]">
            Starter
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-headline text-5xl font-semibold tracking-[-0.04em] text-white">
              $0
            </span>
            <span className="font-body text-lg text-[#A1A1AA]">/month</span>
          </div>
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
            {STARTER_FEATURES.map((f) => (
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
            boxShadow:
              '0 0 60px rgba(255, 103, 51, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
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
          <p className="mt-3 font-body text-[14.5px] leading-relaxed text-[#A1A1AA]">
            Unleash the full agent. Tailored resumes for every role, applied
            autonomously while you sleep.
          </p>

          <Link
            href="/sign-up"
            prefetch
            className="font-label mt-7 inline-flex items-center justify-center rounded-full bg-[#FF6733] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.4)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(255,103,51,0.6)] active:scale-[0.97]"
          >
            Send Scout
          </Link>

          <div className="my-7 h-px w-full bg-white/10" />

          <ul className="space-y-3.5">
            {PRO_FEATURES.map((f) => (
              <FeatureRow key={f.label} feature={f} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
