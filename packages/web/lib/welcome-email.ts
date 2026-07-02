import { getApiBaseUrl } from '@/lib/api'

/** Fire-and-forget welcome email via FastAPI (idempotent on email_sends). */
export function triggerWelcomeEmail(input: {
  userId: string
  email: string
  firstName?: string | null
}): void {
  const secret = process.env.SCOUT_INTERNAL_API_SECRET?.trim()
  if (!secret) return

  void fetch(`${getApiBaseUrl()}/user/welcome-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Scout-Internal': secret,
    },
    body: JSON.stringify({
      user_id: input.userId,
      email: input.email,
      first_name: input.firstName?.trim() || undefined,
    }),
  }).catch(() => {
    // Side effect only — signup must never fail because email did.
  })
}
