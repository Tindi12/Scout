import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Public on purpose: the landing-page "Stay in the loop" form has no Clerk session to
 * check (logged-out visitors). The shared internal secret still proves this call came
 * from our own server, not an arbitrary client — see core/auth.py verify_internal_service.
 */
export async function POST(req: Request) {
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

  let body: { email?: string }
  try {
    body = (await req.json()) as { email?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  const email = body.email?.trim()
  if (!email) {
    return NextResponse.json({ detail: 'Email is required' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${getApiBaseUrl()}/newsletter/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Scout-Internal': secret,
      },
      body: JSON.stringify({ email }),
    })
  } catch {
    return NextResponse.json({ detail: 'API server unreachable' }, { status: 502 })
  }

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, { status: upstream.status, headers: { 'Content-Type': ct } })
}
