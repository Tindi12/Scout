'use client'

import { useEffect } from 'react'

import { ManageBillingButton } from '@/components/billing/ManageBillingButton'
import { SecuredByStripe } from '@/components/billing/SecuredByStripe'
import { DynamicIsland } from '@/components/landing/dynamic-island'
import { Footer } from '@/components/landing/footer'
import { LandingRails, SectionFrame } from '@/components/landing/section-frame'
import { ComparisonChart } from '@/components/pricing/ComparisonChart'
import { PricingCards } from '@/components/pricing/PricingCards'
import type { Viewer } from '@/components/pricing/PlanCta'
import { useTier } from '@/hooks/use-tier'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'

export default function PricingPage() {
  const { plan, isPaid, isSignedIn, loading } = useTier()

  const viewer: Viewer = { isSignedIn, plan, loading }

  // Funnel step: the user saw the pricing/upgrade surface.
  useEffect(() => {
    track(ANALYTICS_EVENTS.UPGRADE_VIEWED, { source: 'pricing_page' })
  }, [])

  return (
    <>
      <DynamicIsland />

      <main className="relative">
        <LandingRails />

        {/* Hero + tier cards */}
        <section className="relative px-6 pb-20 pt-36 lg:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-40 -z-10 mx-auto h-[420px] max-w-3xl rounded-full"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255,103,51,0.08) 0%, transparent 70%)',
              filter: 'blur(120px)',
            }}
          />

          <header className="mx-auto mb-16 max-w-3xl text-center">
            <p className="font-label text-[12px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
              Pricing
            </p>
            <h1 className="mt-4 font-headline text-4xl font-medium tracking-[-0.03em] text-white md:text-6xl">
              Land the internship.
              <br className="hidden sm:block" /> Let Scout apply.
            </h1>
            <p className="mx-auto mt-5 max-w-xl font-body text-[17px] text-[#A1A1AA]">
              Start free. Upgrade to Pro for $14.99/month to unleash the agent —
              tailored resumes and autonomous applications while you sleep.
            </p>

            <div className="mt-6 flex flex-col items-center gap-3">
              <SecuredByStripe />
              {!loading && isPaid ? (
                <ManageBillingButton variant="secondary" />
              ) : null}
            </div>
          </header>

          <PricingCards viewer={viewer} />
        </section>

        {/* Feature comparison */}
        <SectionFrame>
          <section className="px-6 pb-24 pt-20 lg:px-12">
            <ComparisonChart viewer={viewer} />

            <p className="mx-auto mt-16 max-w-2xl text-center font-body text-[13px] leading-relaxed text-[#71717A]">
              Plans are billed monthly and you can cancel anytime from the
              billing portal. Prices in USD. Free includes 25 lifetime
              applications.
            </p>
          </section>
        </SectionFrame>
      </main>

      <Footer />
    </>
  )
}
