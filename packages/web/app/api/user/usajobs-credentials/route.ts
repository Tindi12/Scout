import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

/**
 * Same-origin proxy for the USAJobs credentials endpoint. The browser never talks
 * to FastAPI directly; this server route forwards with the shared internal secret.
 * The password is encrypted server-side in FastAPI and is never returned here.
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

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }

  const { secret, error } = internalSecretOr500()
  if (error) return error

  const upstream = await fetch(`${getApiBaseUrl()}/user/usajobs-credentials`, {
    method: 'GET',
    headers: {
      'X-Scout-Internal': secret,
      'X-Clerk-User-Id': userId,
    },
    cache: 'no-store',
  })

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}

export async function PUT(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }

  const { secret, error } = internalSecretOr500()
  if (error) return error

  let body: { usajobs_email?: string; usajobs_password?: string }
  try {
    body = (await req.json()) as {
      usajobs_email?: string
      usajobs_password?: string
    }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  // Forward only the fields the client actually sent, so an omitted password
  // leaves the stored value unchanged (FastAPI distinguishes omitted vs "").
  const forward: Record<string, string> = {}
  if (typeof body.usajobs_email === 'string') forward.usajobs_email = body.usajobs_email
  if (typeof body.usajobs_password === 'string')
    forward.usajobs_password = body.usajobs_password

  const upstream = await fetch(`${getApiBaseUrl()}/user/usajobs-credentials`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Scout-Internal': secret,
      'X-Clerk-User-Id': userId,
    },
    body: JSON.stringify(forward),
  })

  const text = await upstream.text()
  const ct = upstream.headers.get('Content-Type') || 'application/json'
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': ct },
  })
}
