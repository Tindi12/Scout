import { Fragment } from 'react'
import { ArrowDown, ArrowRight, Rocket, ScanLine, SlidersHorizontal } from 'lucide-react'

const STEPS = [
  {
    icon: ScanLine,
    title: 'Parse & Score',
    body:
      'Scout breaks down your experience, side projects, and skills into a structured graph and scores it across four dimensions in seconds.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Tailor & Optimize',
    body:
      'For every role you target, the agent rewrites your bullets to inject the exact keywords recruiters and ATS scanners look for.',
  },
  {
    icon: Rocket,
    title: 'Autonomous Auto-Apply',
    body:
      'Set your preferences and let Scout submit applications via Greenhouse, Lever, and Workday — the moment new roles drop.',
  },
] as const

export function HowItWorks() {
  return (
    <section
      id="about"
      className="relative px-6 py-32 lg:px-12"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
            How it works
          </p>
          <h2 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-5xl">
            Autopilot for your career.
          </h2>
          <p className="mt-5 font-body text-[17px] text-[#A1A1AA]">
            Three steps. Zero busywork. Scout handles the loop from resume to
            recruiter so you can focus on what matters.
          </p>
        </div>

        <div className="mx-auto flex max-w-5xl flex-col items-stretch gap-4 md:flex-row md:items-stretch md:gap-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <Fragment key={step.title}>
                <div className="glass-card group relative flex-1 basis-0 overflow-hidden rounded-2xl p-7 transition-all duration-300 hover:bg-white/[0.04]">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FF6733]/[0.04] blur-3xl transition-opacity duration-500 group-hover:bg-[#FF6733]/10"
                  />
                  <div className="relative">
                    <div className="font-label text-[11px] uppercase tracking-[0.2em] text-[#888888]">
                      0{i + 1}
                    </div>
                    <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md transition-all duration-300 group-hover:border-[#FF6733]/40 group-hover:bg-[#FF6733]/10">
                      <Icon className="h-5 w-5 text-[#FF6733]" strokeWidth={1.75} />
                    </div>
                    <h3 className="mt-6 font-headline text-xl font-medium tracking-tight text-white">
                      {step.title}
                    </h3>
                    <p className="mt-3 font-body text-[15px] leading-relaxed text-[#A1A1AA]">
                      {step.body}
                    </p>
                  </div>
                </div>

                {i < STEPS.length - 1 ? (
                  <div
                    aria-hidden
                    className="flex shrink-0 items-center justify-center text-[#FF6733]/50"
                  >
                    <ArrowRight
                      className="hidden h-6 w-6 md:block"
                      strokeWidth={1.5}
                    />
                    <ArrowDown
                      className="h-6 w-6 md:hidden"
                      strokeWidth={1.5}
                    />
                  </div>
                ) : null}
              </Fragment>
            )
          })}
        </div>
      </div>
    </section>
  )
}
