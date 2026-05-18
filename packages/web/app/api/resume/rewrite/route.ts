import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Browser calls this same-origin route (session cookie). Server forwards to FastAPI
 * with a shared secret so we don't require Clerk's Supabase JWT template in the client.
 */
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

  let body: { resume_id?: string; target_role?: string; analysis_id?: string }
  try {
    body = (await req.json()) as {
      resume_id?: string
      target_role?: string
      analysis_id?: string
    }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.resume_id?.trim() || !body.target_role?.trim()) {
    return NextResponse.json(
      { detail: 'resume_id and target_role are required' },
      { status: 400 },
    )
  }

  const payload: {
    resume_id: string
    target_role: string
    analysis_id?: string
  } = {
    resume_id: body.resume_id.trim(),
    target_role: body.target_role.trim(),
  }
  if (body.analysis_id?.trim()) {
    payload.analysis_id = body.analysis_id.trim()
  }

  const upstream = await fetch(`${getApiBaseUrl()}/resume/rewrite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Scout-Internal': secret,
      'X-Clerk-User-Id': userId,
    },
    body: JSON.stringify(payload),
  })

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
