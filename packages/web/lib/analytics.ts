'use client'

/**
 * PostHog product analytics — the single, centralized event surface for the web app
 * (Epic 11.6). Every event name lives in ANALYTICS_EVENTS; nothing else in the app
 * should pass a raw string to posthog.capture().
 *
 * Privacy: we identify by Clerk user id and attach only coarse, non-sensitive
 * properties (tier, school, graduation, work auth, job portal, fit category). NEVER
 * pass resume content, answer/message text, or personal contact info through here.
 *
 * No-op safety: if NEXT_PUBLIC_POSTHOG_KEY is unset (local dev) PostHog is never
 * initialized, so every helper below short-circuits and analytics is a silent no-op.
 * All calls are wrapped so a telemetry hiccup can never break a user flow.
 */
import posthog from 'posthog-js'

import { readConsent } from '@/lib/cookie-consent'

export const ANALYTICS_EVENTS = {
  // ---- Funnel (signup → activation → paid) ----
  // signed_up fires SERVER-SIDE from the Clerk webhook (source of truth for account
  // creation); listed here only so the catalog is complete.
  SIGNED_UP: 'signed_up',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  RESUME_UPLOADED: 'resume_uploaded',
  RESUME_SCORED: 'resume_scored',
  JOBS_VIEWED: 'jobs_viewed',
  SCOUT_RUN_STARTED: 'scout_run_started',
  // application_completed fires SERVER-SIDE from the apply task (accuracy-critical).
  APPLICATION_COMPLETED: 'application_completed',
  UPGRADE_VIEWED: 'upgrade_viewed',
  CHECKOUT_STARTED: 'checkout_started',
  PLAN_CHANGE_STARTED: 'plan_change_started',
  // subscription_activated fires SERVER-SIDE from the Stripe webhook (payment source
  // of truth); listed here only for catalog completeness.
  SUBSCRIPTION_ACTIVATED: 'subscription_activated',

  // ---- Feature usage ----
  COPILOT_MESSAGE_SENT: 'copilot_message_sent',
  RESUME_REWRITE_USED: 'resume_rewrite_used',
  RESUME_TAILORED_FOR_JOB: 'resume_tailored_for_job',
  APPLICATION_MANUALLY_MANAGED: 'application_manually_managed',
  NOTIFICATION_CLICKED: 'notification_clicked',
  BILLING_PORTAL_OPENED: 'billing_portal_opened',

  // ---- Mascot tutorial / profile nudge ----
  INTRO_TOUR_SHOWN: 'intro_tour_shown',
  INTRO_TOUR_CONTINUED: 'intro_tour_continued',
  INTRO_TOUR_SKIPPED: 'intro_tour_skipped',
  PROFILE_NUDGE_SHOWN: 'profile_nudge_shown',
  PROFILE_NUDGE_DISMISSED: 'profile_nudge_dismissed',
  PROFILE_NUDGE_CTA_CLICKED: 'profile_nudge_cta_clicked',
  PAGE_INTRO_SHOWN: 'page_intro_shown',
  PAGE_INTRO_DISMISSED: 'page_intro_dismissed',
  FIRST_SCOUT_RUN_ACK_SHOWN: 'first_scout_run_ack_shown',
  FIRST_SCOUT_RUN_ACK_DISMISSED: 'first_scout_run_ack_dismissed',
} as const

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

/** Non-sensitive properties allowed on events. Free-form, but keep keys snake_case
 * and never include resume/answer/message/contact content. */
export type AnalyticsProps = Record<
  string,
  string | number | boolean | null | undefined
>

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

let initialized = false
// Set once the user revokes consent in-session: PostHog may already be initialized
// (can't be un-init'd), so we hard-stop every helper as well as opting out.
let consentRevoked = false

/** True only when a PostHog key is configured AND the user has accepted cookies.
 * Used to gate every call: local dev (no key) and pre-/post-consent never touch the
 * SDK. Consent is read from the first-party cookie on each call. */
export function isAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY) && !consentRevoked && readConsent() === 'accepted'
}

/** Initialize the PostHog browser SDK exactly once. Safe to call repeatedly and on
 * the server (it no-ops unless a key is set and `window` exists). Does NOTHING until
 * the user has accepted cookies — this deferral is the real consent gate, since
 * posthog.init() is what captures the first pageview and sets PostHog cookies. */
export function initAnalytics(): void {
  if (!POSTHOG_KEY || typeof window === 'undefined') return
  if (readConsent() !== 'accepted') return
  if (initialized) {
    // Already initialized this session. If the user had revoked and is now re-
    // accepting, opt back into capturing — init() won't run a second time.
    if (consentRevoked) {
      consentRevoked = false
      try {
        posthog.opt_in_capturing()
      } catch {
        /* no-op */
      }
    }
    return
  }
  consentRevoked = false
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Only create person profiles for users we explicitly identify (logged-in) —
    // keeps anonymous marketing traffic out of person-level analytics.
    person_profiles: 'identified_only',
    // Capture pageviews (incl. SPA route changes) so funnel steps like "explore
    // viewed" are available, but DO NOT autocapture clicks/inputs: autocapture can
    // scrape element/DOM text, and Scout's DOM contains resume/answer content.
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
  })
  initialized = true
}

/** Identify the current user by their Clerk id and merge in coarse person traits.
 * Call on login and whenever traits change. */
export function identifyUser(distinctId: string, traits?: AnalyticsProps): void {
  if (!isAnalyticsEnabled() || !distinctId) return
  try {
    posthog.identify(distinctId, traits)
  } catch {
    /* analytics must never break the app */
  }
}

/** Register super properties attached to EVERY subsequent event (e.g. tier), so we
 * don't have to thread them through individual capture calls. */
export function registerSuperProperties(props: AnalyticsProps): void {
  if (!isAnalyticsEnabled()) return
  try {
    posthog.register(props)
  } catch {
    /* no-op */
  }
}

/** Reset identity on logout so the next user isn't merged into the previous person. */
export function resetUser(): void {
  if (!isAnalyticsEnabled()) return
  try {
    posthog.reset()
  } catch {
    /* no-op */
  }
}

/** Stop analytics when the user revokes consent. If PostHog was already initialized
 * earlier in the session it can't be un-init'd, so we opt out of capturing (stops all
 * network + clears stored data) and reset identity. The consentRevoked flag then makes
 * every helper a no-op for the rest of the session; a fresh page load won't re-init
 * because initAnalytics() re-checks the (now 'rejected') consent cookie. */
export function disableAnalytics(): void {
  consentRevoked = true
  if (!initialized) return
  try {
    posthog.opt_out_capturing()
    posthog.reset()
  } catch {
    /* no-op */
  }
}

/** Capture a product event. The ONLY way the app emits analytics events. */
export function track(event: AnalyticsEvent, properties?: AnalyticsProps): void {
  if (!isAnalyticsEnabled()) return
  try {
    posthog.capture(event, properties)
  } catch {
    /* no-op */
  }
}
