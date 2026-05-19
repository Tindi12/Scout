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
  const jobId = url.searchParams.get('job_id')?.trim()
  const resumeId = url.searchParams.get('resume_id')?.trim()
  if (!jobId || !resumeId) {
    return NextResponse.json(
      { detail: 'job_id and resume_id are required' },
      { status: 400 },
    )
  }

  const qs = new URLSearchParams({ job_id: jobId, resume_id: resumeId })
  let upstream: Response
  try {
    upstream = await fetch(
      `${getApiBaseUrl()}/resume/variant?${qs.toString()}`,
      {
        method: 'GET',
        headers: {
          'X-Scout-Internal': secret,
          'X-Clerk-User-Id': userId,
        },
        cache: 'no-store',
      },
    )
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
