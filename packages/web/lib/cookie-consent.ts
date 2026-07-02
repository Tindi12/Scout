/**
 * First-party cookie-consent storage (no React, no deps — just document.cookie).
 *
 * This is the single source of truth for whether the user has consented to
 * non-essential analytics (PostHog). lib/analytics.ts reads readConsent() to gate
 * PostHog, and CookieConsentProvider writes it.
 *
 * The choice is stored as `choice:version` so a policy-version bump re-prompts:
 * readConsent() returns null when the stored version differs from the current one.
 */

export type ConsentChoice = 'accepted' | 'rejected'

/** Cookie holding the user's choice (`accepted:1` / `rejected:1`). */
export const CONSENT_COOKIE = 'scout_cookie_consent'
/** Anonymous id (first-party) to correlate proof-of-consent for logged-out visitors. */
export const ANON_ID_COOKIE = 'scout_anon_id'
/** Bump when the cookie policy materially changes — invalidates stored choices. */
export const CONSENT_POLICY_VERSION = '1'
/** ~12 months, so the banner doesn't reshow every visit. */
export const CONSENT_MAX_AGE_DAYS = 365

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length))
  }
  return null
}

function writeCookie(name: string, value: string, maxAgeDays: number): void {
  if (typeof document === 'undefined') return
  const maxAge = Math.floor(maxAgeDays * 24 * 60 * 60)
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
}

/**
 * The current consent choice, or null when undecided (no cookie) OR when the stored
 * choice was made under an older policy version (so we re-ask).
 */
export function readConsent(): ConsentChoice | null {
  const raw = readCookie(CONSENT_COOKIE)
  if (!raw) return null
  const [choice, version] = raw.split(':')
  if (version !== CONSENT_POLICY_VERSION) return null
  return choice === 'accepted' || choice === 'rejected' ? choice : null
}

/** Persist the user's choice for ~12 months, tagged with the current policy version. */
export function writeConsent(choice: ConsentChoice): void {
  writeCookie(CONSENT_COOKIE, `${choice}:${CONSENT_POLICY_VERSION}`, CONSENT_MAX_AGE_DAYS)
}

/**
 * A stable first-party anonymous id. Created on first use and reused thereafter so a
 * consent record can be tied to a visitor even before they sign in.
 */
export function getOrCreateAnonId(): string {
  const existing = readCookie(ANON_ID_COOKIE)
  if (existing) return existing
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`
  writeCookie(ANON_ID_COOKIE, id, CONSENT_MAX_AGE_DAYS)
  return id
}
