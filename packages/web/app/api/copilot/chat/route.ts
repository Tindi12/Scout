import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

export const dynamic = 'force-dynamic'

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

  let body: { conversation_id?: string | null; message?: string } = {}
  try {
    body = (await req.json()) as {
      conversation_id?: string | null
      message?: string
    }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json(
      { detail: 'message is required' },
      { status: 422 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(`${getApiBaseUrl()}/copilot/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Scout-Internal': secret,
        'X-Clerk-User-Id': userId,
      },
      body: JSON.stringify({
        conversation_id: body.conversation_id ?? null,
        message: body.message,
      }),
    })
  } catch {
    return NextResponse.json(
      { detail: 'API unreachable. Start the backend (pnpm dev).' },
      { status: 502 },
    )
  }

  // Non-streaming error responses (e.g. 401/404/422) come back as JSON — pass
  // them through verbatim so the client can surface them.
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text()
    const ct = upstream.headers.get('Content-Type') ?? 'application/json'
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': ct },
    })
  }

  // Stream the SSE body straight back to the browser — never buffer it.
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
