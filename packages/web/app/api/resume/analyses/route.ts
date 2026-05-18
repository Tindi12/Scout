import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }

  const secret = process.env.SCOUT_INTERNAL_API_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      {
        detail:
          'Server misconfigured: set SCOUT_INTERNAL_API_SECRET in .env.local',
      },
      { status: 500 },
    )
  }

  const url = new URL(req.url)
  const limit = url.searchParams.get('limit')
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : ''

  const upstream = await fetch(`${getApiBaseUrl()}/resume/analyses${qs}`, {
    method: 'GET',
    headers: {
      'X-Scout-Internal': secret,
      'X-Clerk-User-Id': userId,
    },
    cache: 'no-store',
  })

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
