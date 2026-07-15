import { Suspense } from 'react'

import { AccountDeletedNotice } from '@/components/landing/account-deleted-notice'
import { AnnouncementBanner } from '@/components/landing/announcement-banner'
import { AtsCoverage } from '@/components/landing/ats-coverage'
import { DynamicIsland } from '@/components/landing/dynamic-island'
import { LandingHashScroll } from '@/components/landing/landing-hash-scroll'
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
      <AnnouncementBanner />
      <DynamicIsland />
      <LandingHashScroll />
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
