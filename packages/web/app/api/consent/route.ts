import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Proof-of-consent record-keeping (lightweight). Records the user's cookie choice
 * server-side so we have evidence of consent (who/anon, choice, timestamp, policy
 * version). Two durable sinks, no DB table required:
 *   1. A structured log line (captured by Vercel logs).
 *   2. An httpOnly `scout_consent_audit` cookie the client JS cannot tamper with.
 *
 * This intentionally never blocks the UX — it always returns 200, even on bad input.
 * Upgrading to a Supabase `cookie_consents` insert later needs no client changes.
 */
const VALID_CHOICES = new Set(['accepted', 'rejected'])

export async function POST(req: Request) {
  // Best-effort identity: consent usually happens logged-out on the landing page, so a
  // missing userId is expected and fine — anonId correlates those.
  let userId: string | null = null
  try {
    userId = (await auth()).userId
  } catch {
    userId = null
  }

  let body: { choice?: string; policyVersion?: string; anonId?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const choice = body.choice
  if (!choice || !VALID_CHOICES.has(choice)) {
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const record = {
    choice,
    policy_version: body.policyVersion ?? null,
    user_id: userId,
    anon_id: body.anonId ?? null,
    timestamp: new Date().toISOString(),
    user_agent: req.headers.get('user-agent'),
    // x-forwarded-for is set by Vercel; coarse origin only, not stored long-term.
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  }

  // Structured, greppable proof-of-consent line.
  console.info('[consent]', JSON.stringify(record))

  const res = NextResponse.json({ ok: true }, { status: 200 })
  // Tamper-resistant audit copy (httpOnly so client JS can't forge/alter it).
  res.cookies.set(
    'scout_consent_audit',
    `${choice}|${record.policy_version ?? ''}|${record.timestamp}`,
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    },
  )
  return res
}
