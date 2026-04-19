import { DynamicIsland } from '@/components/landing/dynamic-island'
import { FAQ } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'
import { Hero } from '@/components/landing/hero'
import { HowItWorks } from '@/components/landing/how-it-works'
import { Pricing } from '@/components/landing/pricing'
import { Stats } from '@/components/landing/stats'
import { UniversityBelt } from '@/components/landing/university-belt'

export default function Page() {
  return (
    <>
      <DynamicIsland />
      <main className="relative">
        <Hero />
        <UniversityBelt />
        <HowItWorks />
        <Stats />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  )
}
