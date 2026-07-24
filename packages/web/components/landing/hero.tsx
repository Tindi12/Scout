import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { LandingDashboardShowcase } from '@/components/landing/dashboard-showcase'
import { HeroApplyAnimation } from '@/components/landing/hero-apply-animation'
import { LandingHashLink } from '@/components/landing/landing-hash-link'
import { TypingHeadline } from '@/components/landing/typing-headline'
import { ComingSoonCta } from '@/components/landing/waitlist'
import { Button } from '@/components/ui/button'
import { isWaitlistMode } from '@/lib/waitlist-mode'

export function Hero() {
  const waitlist = isWaitlistMode()

  return (
    // No opaque background on the section — the page-level LandingRails
    // overlay sits at -z-10 and must show through on both sides of the hero.
    <section
      id="top"
      className="px-4 pb-20 pt-28 sm:px-6 sm:pb-28 sm:pt-36 lg:px-12 lg:pb-32 lg:pt-44"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <div className="mb-6 w-full max-w-[min(360px,100%)] sm:mb-8">
          <HeroApplyAnimation />
        </div>

        <TypingHeadline />

        <p className="mt-5 max-w-2xl text-pretty font-body text-[16px] leading-relaxed tracking-[0.005em] text-[#A1A1AA] sm:mt-7 sm:text-balance sm:text-[18px]">
          Scout reads your resume, tailors it to every role it finds, and
          autonomously applies on your behalf. Stop filling out forms. Start
          interviewing.
        </p>

        <div className="mt-8 flex w-full max-w-md flex-col items-stretch gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
          {waitlist ? (
            <ComingSoonCta source="hero" className="min-h-11 w-full sm:w-auto" />
          ) : (
            <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
              <Link href="/sign-up" prefetch className="group">
                Try Scout Now
                <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            size="lg"
            className="min-h-11 w-full sm:w-auto"
          >
            <LandingHashLink href="#about">See how it works</LandingHashLink>
          </Button>
        </div>

        {waitlist ? (
          <p className="mt-4 max-w-md px-2 font-body text-sm leading-relaxed text-[#71717A]">
            Private beta — public access isn&apos;t open yet. Tap Coming soon to
            join the waitlist.
          </p>
        ) : (
          <p className="mt-4 font-body text-sm text-[#71717A]">
            Already have an account?{' '}
            <Link
              href="/login"
              prefetch
              className="inline-flex min-h-11 items-center text-[#A1A1AA] underline-offset-4 transition-colors duration-150 hover:text-white"
            >
              Log in here
            </Link>
            .
          </p>
        )}
      </div>

      <div className="mx-auto mt-14 max-w-6xl sm:mt-20 lg:mt-24">
        <LandingDashboardShowcase />
      </div>
    </section>
  )
}
