import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      {
        detail:
          'Server misconfigured: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.',
      },
      { status: 500 },
    )
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin
    .from('users')
    .select('id, is_pro, target_roles')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { detail: `Failed to load user: ${error.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      id: data?.id ?? null,
      is_pro: Boolean(data?.is_pro),
      target_roles: Array.isArray(data?.target_roles)
        ? (data?.target_roles as unknown[])
        : [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
