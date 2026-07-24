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
    <section id="top" className="px-6 pb-32 pt-40 lg:px-12 lg:pt-44">
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        {/* Apply animation sits where the old stats pill used to be. */}
        <div className="mb-8">
          <HeroApplyAnimation />
        </div>

        <TypingHeadline />

        <p className="mt-7 max-w-2xl text-balance font-body text-[18px] leading-relaxed tracking-[0.005em] text-[#A1A1AA]">
          Scout reads your resume, tailors it to every role it finds, and
          autonomously applies on your behalf. Stop filling out forms. Start
          interviewing.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          {waitlist ? (
            <ComingSoonCta source="hero" />
          ) : (
            <Button asChild size="lg">
              <Link href="/sign-up" prefetch className="group">
                Try Scout Now
                <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="lg">
            <LandingHashLink href="#about">See how it works</LandingHashLink>
          </Button>
        </div>

        {waitlist ? (
          <p className="mt-4 max-w-md font-body text-sm text-[#71717A]">
            Private beta — public access isn&apos;t open yet. Tap Coming soon to
            join the waitlist.
          </p>
        ) : (
          <p className="mt-4 font-body text-sm text-[#71717A]">
            Already have an account?{' '}
            <Link
              href="/login"
              prefetch
              className="text-[#A1A1AA] underline-offset-4 transition-colors duration-150 hover:text-white"
            >
              Log in here
            </Link>
            .
          </p>
        )}
      </div>

      <div className="mx-auto mt-24 max-w-6xl">
        <LandingDashboardShowcase />
      </div>
    </section>
  )
}
