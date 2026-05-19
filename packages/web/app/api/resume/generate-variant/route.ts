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
          'Server misconfigured: set SCOUT_INTERNAL_API_SECRET in .env.local',
      },
      { status: 500 },
    )
  }

  let body: { job_id?: string; resume_id?: string }
  try {
    body = (await req.json()) as { job_id?: string; resume_id?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.job_id?.trim() || !body.resume_id?.trim()) {
    return NextResponse.json(
      { detail: 'job_id and resume_id are required' },
      { status: 400 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(`${getApiBaseUrl()}/resume/generate-variant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Scout-Internal': secret,
        'X-Clerk-User-Id': userId,
      },
      body: JSON.stringify({
        job_id: body.job_id.trim(),
        resume_id: body.resume_id.trim(),
      }),
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
