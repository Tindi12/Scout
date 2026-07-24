import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { LandingDashboardShowcase } from '@/components/landing/dashboard-showcase'
import { HeroApplyAnimation } from '@/components/landing/hero-apply-animation'
import { LandingHashLink } from '@/components/landing/landing-hash-link'
import { TypingHeadline } from '@/components/landing/typing-headline'
import { ComingSoonCta, WaitlistInlineForm } from '@/components/landing/waitlist'
import { Button } from '@/components/ui/button'
import { isWaitlistMode } from '@/lib/waitlist-mode'

const seeHowClass =
  'font-label group inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[#A1A1AA] underline-offset-4 transition-colors hover:text-white hover:underline'

export function Hero() {
  const waitlist = isWaitlistMode()

  return (
    // No opaque background on the section — the page-level LandingRails
    // overlay sits at -z-10 and must show through on both sides of the hero.
    <section
      id="top"
      className="px-4 pb-8 pt-16 sm:px-6 sm:pb-16 sm:pt-28 lg:px-12 lg:pb-28 lg:pt-36"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <div className="mb-4 flex w-full max-w-[min(320px,100%)] items-center justify-center sm:mb-6 sm:max-w-[min(360px,100%)]">
          <HeroApplyAnimation />
        </div>

        <TypingHeadline />

        <p className="mt-3 max-w-md text-pretty font-body text-[14px] leading-relaxed tracking-[0.005em] text-[#A1A1AA] sm:mt-6 sm:max-w-2xl sm:text-balance sm:text-[17px]">
          Scout reads your resume, tailors it to every role it finds, and
          autonomously applies on your behalf. Stop filling out forms. Start
          interviewing.
        </p>

        {waitlist ? (
          <>
            {/* Mobile: inline email (avoids keyboard + dialog collision). Desktop: CTA → dialog. */}
            <div id="hero-waitlist" className="mt-5 w-full max-w-md text-left sm:hidden">
              <WaitlistInlineForm source="hero_mobile" />
            </div>
            <div
              id="hero-waitlist-desktop"
              className="mt-6 hidden w-full max-w-md flex-col items-stretch gap-3 sm:mt-8 sm:flex sm:max-w-none sm:flex-row sm:items-center sm:justify-center"
            >
              <ComingSoonCta source="hero" className="min-h-12 w-full sm:w-auto" />
              <LandingHashLink href="#about" className={`${seeHowClass} justify-center px-2`}>
                See how it works
                <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">
                  →
                </span>
              </LandingHashLink>
            </div>
            <LandingHashLink
              href="#about"
              className={`${seeHowClass} mt-2 sm:hidden`}
            >
              See how it works
              <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">
                →
              </span>
            </LandingHashLink>
          </>
        ) : (
          <>
            <div className="mt-5 flex w-full max-w-md flex-col items-stretch gap-3 sm:mt-8 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
              <Button asChild size="lg" className="min-h-11 w-full sm:min-h-12 sm:w-auto">
                <Link href="/sign-up" prefetch className="group">
                  Try Scout Now
                  <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <LandingHashLink href="#about" className={`${seeHowClass} justify-center px-2 sm:hidden`}>
                See how it works
                <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">
                  →
                </span>
              </LandingHashLink>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="hidden min-h-11 w-full sm:inline-flex sm:w-auto"
              >
                <LandingHashLink href="#about">See how it works</LandingHashLink>
              </Button>
            </div>
            <p className="mt-2.5 font-body text-sm text-[#A1A1AA] sm:mt-3">
              Already have an account?{' '}
              <Link
                href="/login"
                prefetch
                className="inline-flex min-h-10 items-center text-white underline-offset-4 transition-colors duration-150 hover:underline sm:min-h-11"
              >
                Log in here
              </Link>
              .
            </p>
          </>
        )}
      </div>

      <div className="mx-auto mt-6 max-w-6xl sm:mt-14 lg:mt-20">
        <LandingDashboardShowcase />
      </div>
    </section>
  )
}
