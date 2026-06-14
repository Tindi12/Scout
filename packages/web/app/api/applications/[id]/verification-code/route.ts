import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Relay an ATS-emailed verification code into a live apply run (awaiting_code
 * application); proxy to FastAPI. Unlike /answer this does not re-queue the
 * application — the agent is parked mid-session waiting for this code.
 */
export async function POST(
  req: Request,
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
    return NextResponse.json({ detail: 'application id is required' }, { status: 400 })
  }

  let body: { code?: string }
  try {
    body = (await req.json()) as { code?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.code?.trim()) {
    return NextResponse.json({ detail: 'code is required' }, { status: 422 })
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `${getApiBaseUrl()}/applications/${encodeURIComponent(id.trim())}/verification-code`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Scout-Internal': secret,
          'X-Clerk-User-Id': userId,
        },
        body: JSON.stringify({ code: body.code.trim() }),
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
