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

  let body: {
    resume_id?: string
    analysis_id?: string
    rewritten_resume?: Record<string, unknown>
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.resume_id?.trim()) {
    return NextResponse.json({ detail: 'resume_id is required' }, { status: 400 })
  }

  const payload: {
    resume_id: string
    analysis_id?: string
    rewritten_resume?: Record<string, unknown>
  } = {
    resume_id: body.resume_id.trim(),
  }
  if (body.analysis_id?.trim()) {
    payload.analysis_id = body.analysis_id.trim()
  }
  if (body.rewritten_resume && typeof body.rewritten_resume === 'object') {
    payload.rewritten_resume = body.rewritten_resume
  }

  const upstream = await fetch(`${getApiBaseUrl()}/resume/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Scout-Internal': secret,
      'X-Clerk-User-Id': userId,
    },
    body: JSON.stringify(payload),
  })

  if (!upstream.ok) {
    const text = await upstream.text()
    const ct = upstream.headers.get('Content-Type') || 'application/json'
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': ct },
    })
  }

  const pdf = await upstream.arrayBuffer()
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="scout_resume.pdf"',
    },
  })
}
