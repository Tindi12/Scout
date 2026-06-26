// Sentry init for the EDGE runtime (middleware + any edge route handlers). Loaded by
// instrumentation.ts. No-ops when no DSN is set (local dev).
import * as Sentry from '@sentry/nextjs'

import { scrubEvent } from '@/lib/sentry-scrub'

const dsn =
  process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''

Sentry.init({
  dsn,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1',
  ),
  sendDefaultPii: false,
  beforeSend: scrubEvent,
})
