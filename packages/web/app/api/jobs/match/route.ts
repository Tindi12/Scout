import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Browser calls this same-origin route (session cookie). Server forwards to FastAPI
 * with the shared internal secret so the client doesn't need a Supabase JWT.
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

  let body: {
    limit?: number
    remote_only?: boolean
    visa_friendly_only?: boolean
  } = {}
  try {
    const raw = (await req.json().catch(() => ({}))) as unknown
    if (raw && typeof raw === 'object') {
      body = raw as typeof body
    }
  } catch {
    body = {}
  }

  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit) && body.limit > 0
      ? Math.floor(body.limit)
      : 50

  const payload = {
    limit,
    remote_only: Boolean(body.remote_only),
    visa_friendly_only: Boolean(body.visa_friendly_only),
  }

  const upstream = await fetch(`${getApiBaseUrl()}/jobs/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Scout-Internal': secret,
      'X-Clerk-User-Id': userId,
    },
    body: JSON.stringify(payload),
  })

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
