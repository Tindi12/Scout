import { DynamicIsland } from '@/components/landing/dynamic-island'
import { Footer } from '@/components/landing/footer'
import { LandingRails } from '@/components/landing/section-frame'
import type { ReactNode } from 'react'

/**
 * Same chrome as /pricing: nav + full-height LandingRails on <main>.
 * Article pages set data-content-rails="off" to hide the grid for prose reading.
 */
export default function ContentSectionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DynamicIsland />
      <main className="relative min-h-screen">
        <LandingRails />
        {children}
      </main>
      <Footer />
    </>
  )
}
