import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

const VALID_TIERS = ['pro', 'scout_plus'] as const
type PaidTier = (typeof VALID_TIERS)[number]

/**
 * Browser calls this same-origin route (session cookie). Server forwards to FastAPI
 * with the shared internal secret. The upstream modifies the caller's EXISTING
 * Stripe subscription in place (price swap with proration) — the in-app plan-change
 * path for subscribers, since Checkout would create a second subscription.
 */
export async function POST(req: Request) {
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

  let body: { tier?: string }
  try {
    body = (await req.json()) as { tier?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const tier = body.tier?.trim().toLowerCase()
  if (!tier || !VALID_TIERS.includes(tier as PaidTier)) {
    return NextResponse.json(
      { detail: 'tier must be one of: pro, scout_plus' },
      { status: 400 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(`${getApiBaseUrl()}/stripe/change-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Scout-Internal': secret,
        'X-Clerk-User-Id': userId,
      },
      body: JSON.stringify({ tier }),
    })
  } catch {
    return NextResponse.json(
      { detail: 'API unreachable. Start the backend (pnpm dev).' },
      { status: 502 },
    )
  }

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
