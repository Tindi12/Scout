'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { CookieConsentBanner } from '@/components/consent/CookieConsentBanner'
import { disableAnalytics, initAnalytics } from '@/lib/analytics'
import {
  CONSENT_POLICY_VERSION,
  type ConsentChoice,
  getOrCreateAnonId,
  readConsent,
  writeConsent,
} from '@/lib/cookie-consent'

type ConsentContextValue = {
  /** null = undecided (no valid cookie yet). */
  consent: ConsentChoice | null
  isBannerOpen: boolean
  accept: () => void
  reject: () => void
  /** Reopen the banner so the user can change their choice (footer link). */
  openPreferences: () => void
}

const CookieConsentContext = createContext<ConsentContextValue | null>(null)

export function useCookieConsent(): ConsentContextValue {
  const ctx = useContext(CookieConsentContext)
  if (!ctx) {
    throw new Error('useCookieConsent must be used within CookieConsentProvider')
  }
  return ctx
}

/** Fire-and-forget proof-of-consent record. Never blocks or breaks the UX. */
function recordConsent(choice: ConsentChoice) {
  try {
    void fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        choice,
        policyVersion: CONSENT_POLICY_VERSION,
        anonId: getOrCreateAnonId(),
      }),
    }).catch(() => {})
  } catch {
    /* analytics/consent logging must never break the app */
  }
}

export function CookieConsentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // Undecided until the cookie is read on mount. Reading in an effect (not during
  // render) keeps SSR and the first client render identical — no hydration mismatch,
  // and the banner only appears after mount.
  const [consent, setConsent] = useState<ConsentChoice | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isBannerOpen, setBannerOpen] = useState(false)

  useEffect(() => {
    setConsent(readConsent())
    setHydrated(true)
  }, [])

  // Single owner of PostHog init: drive it off the consent value. Idempotent.
  useEffect(() => {
    if (!hydrated) return
    if (consent === 'accepted') initAnalytics()
    else if (consent === 'rejected') disableAnalytics()
  }, [consent, hydrated])

  const accept = useCallback(() => {
    writeConsent('accepted')
    setConsent('accepted')
    setBannerOpen(false)
    recordConsent('accepted')
  }, [])

  const reject = useCallback(() => {
    writeConsent('rejected')
    setConsent('rejected')
    setBannerOpen(false)
    recordConsent('rejected')
  }, [])

  const openPreferences = useCallback(() => setBannerOpen(true), [])

  const value = useMemo<ConsentContextValue>(
    () => ({ consent, isBannerOpen, accept, reject, openPreferences }),
    [consent, isBannerOpen, accept, reject, openPreferences],
  )

  // Show on first visit (undecided) or when explicitly reopened from preferences.
  const showBanner = hydrated && (consent === null || isBannerOpen)

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      {showBanner ? (
        <CookieConsentBanner
          onAccept={accept}
          onReject={reject}
          onClose={consent !== null ? () => setBannerOpen(false) : undefined}
        />
      ) : null}
    </CookieConsentContext.Provider>
  )
}
