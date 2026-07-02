import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Same-origin proxy for the Composio mail-connection endpoints. The browser never
 * talks to FastAPI directly; this server route forwards with the shared internal
 * secret. No OAuth token ever passes through here — Composio holds it; FastAPI
 * returns only connection state and the hosted consent-screen URL.
 */
function internalSecretOr500() {
  const secret = process.env.SCOUT_INTERNAL_API_SECRET?.trim()
  if (!secret) {
    return {
      error: NextResponse.json(
        {
          detail:
            'Server misconfigured: set SCOUT_INTERNAL_API_SECRET in .env.local (same value as packages/api/.env)',
        },
        { status: 500 },
      ),
    }
  }
  return { secret }
}

async function forward(
  method: 'GET' | 'POST' | 'DELETE',
  userId: string,
  secret: string,
  body?: unknown,
) {
  const upstream = await fetch(`${getApiBaseUrl()}/user/mail-connection`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'X-Scout-Internal': secret,
      'X-Clerk-User-Id': userId,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })
  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }
  const { secret, error } = internalSecretOr500()
  if (error) return error
  return forward('GET', userId, secret)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }
  const { secret, error } = internalSecretOr500()
  if (error) return error

  let body: { provider?: string; return_to?: string }
  try {
    body = (await req.json()) as { provider?: string; return_to?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }
  if (body.provider !== 'google' && body.provider !== 'microsoft') {
    return NextResponse.json(
      { detail: "provider must be 'google' or 'microsoft'" },
      { status: 422 },
    )
  }
  const forwardBody: { provider: string; return_to?: string } = {
    provider: body.provider,
  }
  if (body.return_to === '/dashboard' || body.return_to === '/settings') {
    forwardBody.return_to = body.return_to
  }
  return forward('POST', userId, secret, forwardBody)
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }
  const { secret, error } = internalSecretOr500()
  if (error) return error
  return forward('DELETE', userId, secret)
}
