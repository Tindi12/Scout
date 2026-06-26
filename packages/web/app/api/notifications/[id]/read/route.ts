import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params
  if (!id?.trim()) {
    return NextResponse.json({ detail: 'notification id is required' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `${getApiBaseUrl()}/notifications/${encodeURIComponent(id.trim())}/read`,
      {
        method: 'PATCH',
        headers: {
          'X-Scout-Internal': secret,
          'X-Clerk-User-Id': userId,
        },
      },
    )
  } catch {
    return NextResponse.json({ detail: 'API server unreachable' }, { status: 502 })
  }

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
