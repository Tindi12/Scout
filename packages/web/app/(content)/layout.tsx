import { DynamicIsland } from '@/components/landing/dynamic-island'
import { Footer } from '@/components/landing/footer'
import { LandingRails } from '@/components/landing/section-frame'
import type { ReactNode } from 'react'

/**
 * Shared marketing chrome for /blog and /changelog.
 * Keeping nav + footer in a layout means tab switches only remount page content
 * instead of flashing a full-page remount.
 */
export default function ContentSectionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DynamicIsland />
      <main className="relative min-h-screen pt-28 lg:pt-32">
        <LandingRails />
        {children}
      </main>
      <Footer />
    </>
  )
}
