import { Suspense } from 'react'

import { AccountDeletedNotice } from '@/components/landing/account-deleted-notice'
import { AtsCoverage } from '@/components/landing/ats-coverage'
import { DynamicIsland } from '@/components/landing/dynamic-island'
import { FAQ } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'
import { Hero } from '@/components/landing/hero'
import { HowItWorks } from '@/components/landing/how-it-works'
import { InternationalStudents } from '@/components/landing/international-students'
import { Pricing } from '@/components/landing/pricing'
import { LandingRails, SectionFrame } from '@/components/landing/section-frame'
import { Stats } from '@/components/landing/stats'
import { UniversityBelt } from '@/components/landing/university-belt'
export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <AccountDeletedNotice />
      </Suspense>
      <DynamicIsland />
      <main className="relative">
        <LandingRails />
        <Hero />
        <SectionFrame>
          <UniversityBelt />
        </SectionFrame>
        <SectionFrame>
          <HowItWorks />
        </SectionFrame>
        <SectionFrame>
          <AtsCoverage />
        </SectionFrame>
        <SectionFrame>
          <Stats />
        </SectionFrame>
        <SectionFrame>
          <Pricing />
        </SectionFrame>
        <SectionFrame>
          <InternationalStudents />
        </SectionFrame>
        <SectionFrame>
          <FAQ />
        </SectionFrame>
      </main>
      <Footer />
    </>
  )
}
