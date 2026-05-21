import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

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

  let body: { job_ids?: string[] } = {}
  try {
    body = (await req.json()) as { job_ids?: string[] }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.job_ids) || body.job_ids.length === 0) {
    return NextResponse.json(
      { detail: 'job_ids is required and must be a non-empty array' },
      { status: 422 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(`${getApiBaseUrl()}/jobs/scout/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Scout-Internal': secret,
        'X-Clerk-User-Id': userId,
      },
      body: JSON.stringify({ job_ids: body.job_ids }),
    })
  } catch {
    return NextResponse.json(
      { detail: 'API unreachable. Start the backend (pnpm dev).' },
      { status: 502 },
    )
  }

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') ?? 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
