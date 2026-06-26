// Sentry init for the BROWSER. Captures client-side errors and unhandled promise
// rejections (the SDK installs global handlers for both). DSN comes from the public
// env var so it's available client-side. No-ops when the DSN is unset (local dev).
//
// This is the Next.js `instrumentation-client.ts` convention (replaces the old
// sentry.client.config.ts) — required for the SDK to work under Turbopack.
import * as Sentry from '@sentry/nextjs'

import { scrubEvent } from '@/lib/sentry-scrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1',
  ),
  // Never auto-attach PII (IP address, etc.) from the browser.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  // Expected/handled noise we don't want flooding Sentry: auth redirects and the
  // handled "upgrade required" Pro gate surface as thrown errors in some flows.
  ignoreErrors: [
    'AbortError',
    'upgrade_required',
    'NEXT_REDIRECT',
    'NEXT_NOT_FOUND',
  ],
})

// Report client-side navigations to Sentry's tracing (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
