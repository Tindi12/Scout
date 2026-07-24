import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Public on purpose: landing "Coming soon" waitlist has no Clerk session.
 * Writes go through the service role only — the waitlist table has no anon policies.
 */
export async function POST(req: Request) {
  let body: { email?: string; source?: string; website?: string }
  try {
    body = (await req.json()) as { email?: string; source?: string; website?: string }
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 })
  }

  // Honeypot — bots fill hidden fields; humans leave them empty.
  if (body.website?.trim()) {
    return NextResponse.json({ status: 'ok' })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ detail: 'A valid email is required' }, { status: 400 })
  }

  const source =
    typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 64)
      : 'landing'

  const admin = getAdmin()
  if (!admin) {
    return NextResponse.json(
      {
        detail:
          'Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      },
      { status: 500 },
    )
  }

  const { error } = await admin.from('waitlist').insert({ email, source })

  if (error) {
    // Unique violation → already on the list (Postgres 23505)
    if (error.code === '23505') {
      return NextResponse.json({ status: 'already' })
    }
    console.error('[waitlist] insert failed', error.message)
    return NextResponse.json({ detail: 'Could not join the waitlist. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok' })
}
