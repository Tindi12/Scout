// Next.js instrumentation hook — runs once per server/edge runtime at startup and
// loads the matching Sentry config. (Enabled via experimental.instrumentationHook in
// next.config.mjs for Next 14.) onRequestError forwards server-side request errors
// — server components, route handlers, server actions — to Sentry.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
