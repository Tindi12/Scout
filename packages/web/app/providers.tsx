'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect } from 'react'

import {
  identifyUser,
  initAnalytics,
  isAnalyticsEnabled,
  registerSuperProperties,
  resetUser,
} from '@/lib/analytics'

/**
 * App-wide client providers. Currently this is where PostHog product analytics is
 * initialized and where users are identified by their Clerk id so events tie to a
 * person across sessions. Rendered inside <ClerkProvider> (needs useAuth) but high
 * enough to wrap the whole app.
 *
 * No-ops cleanly when NEXT_PUBLIC_POSTHOG_KEY is unset (local dev).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics()
  }, [])

  return (
    <>
      <AnalyticsIdentity />
      {children}
    </>
  )
}

/**
 * Ties the authenticated Clerk user to PostHog. On sign-in we identify by Clerk id
 * immediately (so events are attributed even before traits load), then enrich the
 * person with coarse, non-sensitive properties from /api/user/me (tier, school,
 * graduation, work auth). subscription_plan is also registered as a super property
 * so every event is segmentable by tier. On sign-out we reset.
 */
function AnalyticsIdentity() {
  const { isLoaded, isSignedIn, userId } = useAuth()

  useEffect(() => {
    if (!isAnalyticsEnabled() || !isLoaded) return

    if (!isSignedIn || !userId) {
      resetUser()
      return
    }

    // Identify by Clerk id right away; traits get merged in once they load.
    identifyUser(userId)

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/user/me', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const body = (await res.json()) as {
          subscription_plan?: string | null
          profile?: Record<string, unknown> | null
        }
        if (cancelled) return

        const profile = body.profile ?? {}
        const plan = body.subscription_plan ?? 'free'

        identifyUser(userId, {
          subscription_plan: plan,
          school: (profile.school as string | null) ?? null,
          // Expected graduation (DATE string) — a cohort dimension, not PII.
          graduation: (profile.education_end_date as string | null) ?? null,
          work_authorization:
            (profile.work_authorization as string | null) ?? null,
          requires_sponsorship:
            (profile.requires_sponsorship as boolean | null) ?? null,
        })

        // Attach tier to every subsequent event for easy funnel/usage segmentation.
        registerSuperProperties({ subscription_plan: plan })
      } catch {
        /* analytics must never break the app */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, userId])

  return null
}
