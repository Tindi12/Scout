import Link from 'next/link'
import { ArrowRight, Globe, Search } from 'lucide-react'

import { LandingDashboardShowcase } from '@/components/landing/dashboard-showcase'
import { TypingHeadline } from '@/components/landing/typing-headline'
import { LANDING_HERO_PILL } from '@/lib/landing-stats'

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden px-6 pb-32 pt-40 lg:px-12 lg:pt-48"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[700px] w-[900px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle at center, rgba(255,103,51,0.10) 0%, rgba(255,103,51,0.04) 35%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-40 -z-10 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #1a1a1a 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-80 -z-10 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #1a1a1a 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />

      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <div className="relative mb-8 inline-flex overflow-hidden rounded-full p-[1px]">
          <span
            aria-hidden
            className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#000000_0%,#000000_50%,#FF6733_100%)]"
          />
          <span className="relative z-10 inline-flex items-center gap-2.5 rounded-full bg-[#0a0a0a] px-4 py-1.5 backdrop-blur-xl">
            <Search
              className="h-3.5 w-3.5 shrink-0 text-emerald-400"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="font-label inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium tracking-wide text-white/90">
              <span>{LANDING_HERO_PILL.databaseLine}</span>
              <span className="text-white/35" aria-hidden>
                ·
              </span>
              <Globe
                className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                strokeWidth={1.75}
                aria-hidden
              />
              <span>{LANDING_HERO_PILL.internationalLine}</span>
            </span>
          </span>
        </div>

        <TypingHeadline />

        <p className="mt-7 max-w-2xl text-balance font-body text-[18px] leading-relaxed tracking-[0.005em] text-[#A1A1AA]">
          Scout reads your resume, tailors it to every role it finds, and
          autonomously applies on your behalf. Stop filling out forms. Start
          interviewing.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            prefetch
            className="font-label group inline-flex items-center justify-center gap-2 rounded-full bg-[#FF6733] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(255,103,51,0.35)] transition-all duration-200 hover:shadow-[0_0_56px_rgba(255,103,51,0.55)] active:scale-[0.97]"
          >
            Try Scout Now
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="#about"
            className="font-label inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm font-medium text-white/90 backdrop-blur-md transition-all duration-200 hover:bg-white/[0.08]"
          >
            See how it works
          </Link>
        </div>

        <p className="mt-4 font-body text-sm text-[#71717A]">
          Already have an account?{' '}
          <Link
            href="/login"
            prefetch
            className="text-[#A1A1AA] underline-offset-4 transition-colors duration-200 hover:text-white"
          >
            Log in here
          </Link>
          .
        </p>
      </div>

      <div className="relative mx-auto mt-24 max-w-6xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-12 -top-10 h-40 -z-10 rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255,103,51,0.18) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <LandingDashboardShowcase />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-10 h-32 bg-gradient-to-t from-black to-transparent"
        />
      </div>
    </section>
  )
}
