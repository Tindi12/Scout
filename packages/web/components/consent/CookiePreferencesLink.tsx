'use client'

import { useCookieConsent } from '@/components/consent/CookieConsentProvider'

/**
 * Footer entry point to change the cookie choice later. Styled to match the other
 * footer links; reopens the consent banner via the provider.
 */
export function CookiePreferencesLink() {
  const { openPreferences } = useCookieConsent()
  return (
    <button
      type="button"
      onClick={openPreferences}
      className="font-body inline-flex min-h-11 items-center text-left text-[15px] text-[#A1A1AA] transition-all duration-200 hover:translate-x-0.5 hover:text-white"
    >
      Cookie preferences
    </button>
  )
}
