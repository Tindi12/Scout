import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ applicationId: string }> },
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

  const { applicationId } = await params
  if (!applicationId?.trim()) {
    return NextResponse.json({ detail: 'application id is required' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `${getApiBaseUrl()}/notifications/by-application/${encodeURIComponent(applicationId.trim())}/dismiss`,
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
