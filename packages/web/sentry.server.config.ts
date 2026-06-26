// Sentry init for the Next.js SERVER runtime (Node) — server components, route
// handlers, and server actions. Loaded by instrumentation.ts. No-ops when no DSN is
// set (local dev). See sentry.client.config.ts for the browser, sentry.edge.config.ts
// for the edge runtime.
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
  // Scout handles resumes / personal data / payments — never auto-attach PII.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
})
