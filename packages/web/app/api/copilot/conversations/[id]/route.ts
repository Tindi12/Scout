import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

export async function GET(
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
          'Server misconfigured: set SCOUT_INTERNAL_API_SECRET in .env.local',
      },
      { status: 500 },
    )
  }

  const { id: rawId } = await params
  const id = rawId?.trim()
  if (!id) {
    return NextResponse.json({ detail: 'id required' }, { status: 400 })
  }

  const upstream = await fetch(
    `${getApiBaseUrl()}/copilot/conversations/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers: {
        'X-Scout-Internal': secret,
        'X-Clerk-User-Id': userId,
      },
      cache: 'no-store',
    },
  )

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
