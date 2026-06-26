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

/** True only when a PostHog key is configured. Used to gate every call so local dev
 * (no key) never touches the SDK. */
export function isAnalyticsEnabled(): boolean {
  return Boolean(POSTHOG_KEY)
}

/** Initialize the PostHog browser SDK exactly once. Safe to call repeatedly and on
 * the server (it no-ops unless a key is set and `window` exists). */
export function initAnalytics(): void {
  if (initialized || !POSTHOG_KEY || typeof window === 'undefined') return
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

/** Capture a product event. The ONLY way the app emits analytics events. */
export function track(event: AnalyticsEvent, properties?: AnalyticsProps): void {
  if (!isAnalyticsEnabled()) return
  try {
    posthog.capture(event, properties)
  } catch {
    /* no-op */
  }
}
