'use client'

import { useEffect } from 'react'

/**
 * App Router client navigations to /#section do not always scroll to the hash.
 * Run once on mount so footer / pricing-page links land on the right section.
 */
export function LandingHashScroll() {
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return

    const scrollToTarget = () => {
      const target = document.querySelector(hash)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    const id = window.requestAnimationFrame(scrollToTarget)
    return () => window.cancelAnimationFrame(id)
  }, [])

  return null
}
