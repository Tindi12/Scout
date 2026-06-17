import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { buildApplicationCredits } from '@/lib/application-credits'
import { ensureSupabaseUser } from '@/lib/ensure-supabase-user'
import { normalizeSubscriptionPlan } from '@/lib/subscription-plan'

const PROFILE_COLUMNS = [
  'id',
  'is_pro',
  'subscription_plan',
  'name',
  'phone_number',
  'linkedin_url',
  'github_url',
  'portfolio_url',
  'address_street',
  'address_city',
  'address_state',
  'address_zip',
  'address_country',
  'work_authorization',
  'cpt_eligible',
  'opt_eligible',
  'requires_sponsorship',
  'school',
  'degree_type',
  'major',
  'minor',
  'gpa',
  'education_start_date',
  'education_end_date',
  'target_roles',
  'preferred_locations',
  'remote_preference',
  'willing_to_relocate',
  'earliest_start_date',
  'heard_about_us',
  'default_cover_letter',
  'generate_cover_letters',
  'gender_identity',
  'race_ethnicity',
  'veteran_status',
  'disability_status',
  'profile_complete',
] as const

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

  const ensured = await ensureSupabaseUser(userId)

  const { data, error } = await admin
    .from('users')
    .select(PROFILE_COLUMNS.join(', '))
    .eq('clerk_id', userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { detail: `Failed to load user: ${error.message}` },
      { status: 500 },
    )
  }

  const row = (data ?? {}) as Record<string, unknown>
  const supabaseUserId =
    (row.id as string | null) ?? ensured?.id ?? null
  const subscriptionPlan = normalizeSubscriptionPlan(
    row.subscription_plan as string | null | undefined,
    row.is_pro as boolean | null | undefined,
  )

  let applicationUsed = 0
  if (supabaseUserId) {
    const { count, error: countError } = await admin
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', supabaseUserId)
    if (!countError && typeof count === 'number') applicationUsed = count
  }

  const applicationCredits = buildApplicationCredits(
    subscriptionPlan,
    applicationUsed,
  )

  return NextResponse.json(
    {
      id: supabaseUserId,
      is_pro: Boolean(row.is_pro),
      subscription_plan: subscriptionPlan,
      application_credits: applicationCredits,
      target_roles: Array.isArray(row.target_roles)
        ? (row.target_roles as unknown[])
        : [],
      profile_complete: Boolean(
        row.profile_complete ?? ensured?.profile_complete,
      ),
      onboarding_complete: Boolean(
        row.onboarding_complete ?? ensured?.onboarding_complete,
      ),
      profile: data ? row : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
