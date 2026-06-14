import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Stop all active applications for the signed-in user; proxy to FastAPI.
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

  const upstream = await fetch(`${getApiBaseUrl()}/applications/stop-all`, {
    method: 'POST',
    headers: {
      'X-Scout-Internal': secret,
      'X-Clerk-User-Id': userId,
    },
  })

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}

