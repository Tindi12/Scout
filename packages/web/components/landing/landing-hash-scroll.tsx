'use client'

import { useEffect } from 'react'

import { scrollToLandingHash } from '@/lib/landing-scroll'

/**
 * App Router client navigations to /#section do not always scroll to the hash.
 * Handle initial load + back/forward so footer / pricing-page links land correctly.
 */
export function LandingHashScroll() {
  useEffect(() => {
    const scrollFromLocation = () => {
      const hash = window.location.hash
      if (!hash) return
      // History already has the hash — don't push another entry.
      scrollToLandingHash(hash, { updateHistory: false })
    }

    // Defer one frame so section layout is settled after hydration.
    const id = window.requestAnimationFrame(scrollFromLocation)
    window.addEventListener('hashchange', scrollFromLocation)
    window.addEventListener('popstate', scrollFromLocation)

    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('hashchange', scrollFromLocation)
      window.removeEventListener('popstate', scrollFromLocation)
    }
  }, [])

  return null
}
