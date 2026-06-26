// Shared PII/secret scrubber for every Sentry runtime (client, server, edge).
// Scout handles resumes, personal info, answers, and payment data — none of that may
// leave the app in an error event. Runs as Sentry's beforeSend hook.
import type { ErrorEvent, EventHint } from '@sentry/nextjs'

// Header / cookie names that carry auth tokens or webhook secrets.
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'stripe-signature',
  'x-scout-internal',
  'x-clerk-user-id',
  'x-api-key',
])

const REDACTED = '[redacted]'

export function scrubEvent(
  event: ErrorEvent,
  _hint: EventHint,
): ErrorEvent | null {
  const request = event.request
  if (request) {
    // Never ship the request body (may contain resume content, answers, PII).
    delete request.data
    delete request.cookies
    if (request.headers && typeof request.headers === 'object') {
      for (const key of Object.keys(request.headers)) {
        if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
          ;(request.headers as Record<string, string>)[key] = REDACTED
        }
      }
    }
    // Strip query strings — they can carry session_id / tokens.
    if (typeof request.query_string === 'string') {
      delete request.query_string
    }
  }
  return event
}
