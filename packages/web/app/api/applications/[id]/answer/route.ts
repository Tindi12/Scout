import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Submit an answer for a needs_attention application; proxy to FastAPI.
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

  let body: { answer?: string }
  try {
    body = (await req.json()) as { answer?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.answer?.trim()) {
    return NextResponse.json({ detail: 'answer is required' }, { status: 422 })
  }

  const upstream = await fetch(
    `${getApiBaseUrl()}/applications/${encodeURIComponent(id.trim())}/answer`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Scout-Internal': secret,
        'X-Clerk-User-Id': userId,
      },
      body: JSON.stringify({ answer: body.answer.trim() }),
    },
  )

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
