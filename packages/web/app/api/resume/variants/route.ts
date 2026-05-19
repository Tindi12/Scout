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

  const resumeId = new URL(req.url).searchParams.get('resume_id')?.trim()
  if (!resumeId) {
    return NextResponse.json({ detail: 'resume_id is required' }, { status: 400 })
  }

  const qs = new URLSearchParams({ resume_id: resumeId })
  const upstream = await fetch(
    `${getApiBaseUrl()}/resume/variants?${qs.toString()}`,
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
