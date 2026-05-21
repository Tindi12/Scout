import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Browser calls this same-origin route (session cookie). Server forwards to FastAPI
 * with a shared secret so we don't require Clerk's Supabase JWT template in the client.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ run_id: string }> },
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

  const { run_id } = await params
  if (!run_id?.trim()) {
    return NextResponse.json({ detail: 'run_id is required' }, { status: 400 })
  }

  const upstream = await fetch(
    `${getApiBaseUrl()}/jobs/scout/runs/${encodeURIComponent(run_id.trim())}`,
    {
      headers: {
        'X-Scout-Internal': secret,
        'X-Clerk-User-Id': userId,
      },
      cache: 'no-store',
    },
  )

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, { status: upstream.status, headers: { 'Content-Type': ct } })
}
