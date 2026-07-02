'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect } from 'react'

import {
  CookieConsentProvider,
  useCookieConsent,
} from '@/components/consent/CookieConsentProvider'
import {
  identifyUser,
  isAnalyticsEnabled,
  registerSuperProperties,
  resetUser,
} from '@/lib/analytics'

/**
 * App-wide client providers. This wraps the app in the cookie-consent provider, which
 * owns PostHog initialization (init only happens after the user accepts cookies — see
 * CookieConsentProvider). Users are then identified by their Clerk id so events tie to
 * a person across sessions. Rendered inside <ClerkProvider> (needs useAuth) but high
 * enough to wrap the whole app.
 *
 * No-ops cleanly when NEXT_PUBLIC_POSTHOG_KEY is unset (local dev) or before consent.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CookieConsentProvider>
      <AnalyticsIdentity />
      {children}
    </CookieConsentProvider>
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
  const { consent } = useCookieConsent()

  useEffect(() => {
    // `consent` is in the deps so that when a signed-in user accepts cookies mid-
    // session (PostHog just initialized), we (re)identify them. isAnalyticsEnabled()
    // already returns false until consent === 'accepted'.
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
  }, [isLoaded, isSignedIn, userId, consent])

  return null
}
