import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Self-serve account deletion. The user comes ONLY from the Clerk session — no id is
 * ever read from the request — so a user can only delete their own account.
 *
 * Two-phase, in this order:
 *  1. FastAPI POST /account/delete — Stripe cancel + customer delete, Composio
 *     revoke, Storage purge, then the users row (children cascade). If any external
 *     step fails, FastAPI aborts BEFORE deleting the row and returns 502 so a retry
 *     still has the ids it needs.
 *  2. Clerk user deletion LAST — once Clerk is gone the session is gone, so it must
 *     come after everything that might need a retry under this identity.
 *
 * Retry-safe end to end: if Clerk deletion fails, re-POSTing no-ops through FastAPI
 * (already_deleted) and retries Clerk.
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }

  const secret = process.env.SCOUT_INTERNAL_API_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      {
        detail:
          'Server misconfigured: set SCOUT_INTERNAL_API_SECRET in .env.local (same value as packages/api/.env)',
      },
      { status: 500 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(`${getApiBaseUrl()}/account/delete`, {
      method: 'POST',
      headers: {
        'X-Scout-Internal': secret,
        'X-Clerk-User-Id': userId,
      },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json(
      { detail: 'Could not reach the deletion service. Nothing was deleted — try again.' },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    // Pass FastAPI's step report through unchanged (it contains no ids/PII).
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    })
  }

  const result = (await upstream.json()) as {
    ok: boolean
    already_deleted: boolean
    steps: Record<string, string>
  }

  // Clerk LAST — after this the user's session and identity are gone for good.
  try {
    const client = await clerkClient()
    await client.users.deleteUser(userId)
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status !== 404) {
      console.error('Clerk user deletion failed after data cleanup:', err)
      return NextResponse.json(
        {
          detail:
            'Your data was deleted, but signing you out of the account system failed. Please try again.',
          steps: result.steps,
        },
        { status: 502 },
      )
    }
    // 404 — already deleted (a retry). Fall through to success.
  }

  return NextResponse.json({
    ok: true,
    steps: { ...result.steps, clerk: 'deleted' },
  })
}
