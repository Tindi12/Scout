'use server'

import { auth } from '@clerk/nextjs/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { buildApplicationCredits } from '@/lib/application-credits'
import { normalizeSubscriptionPlan } from '@/lib/subscription-plan'

export type QueueApplicationInput = {
  jobId: string
  company: string
  role: string
  url: string
}

export type QueueApplicationResult =
  | { ok: true; applicationId: string | null }
  | { ok: false; error: string }

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function countApplications(
  admin: SupabaseClient,
  supabaseUserId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', supabaseUserId)
  if (error || typeof count !== 'number') return 0
  return count
}

export async function queueApplication(
  input: QueueApplicationInput,
): Promise<QueueApplicationResult> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, error: 'Unauthorized' }
  }

  const admin = getAdminClient()
  if (!admin) {
    return {
      ok: false,
      error:
        'Server misconfigured: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.',
    }
  }

  const userLookup = await admin
    .from('users')
    .select('id, profile_complete, is_pro, subscription_plan')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (userLookup.error) {
    return { ok: false, error: `Failed to load user: ${userLookup.error.message}` }
  }

  const userRow = userLookup.data as {
    id?: string
    profile_complete?: boolean | null
    is_pro?: boolean | null
    subscription_plan?: string | null
  } | null
  const supabaseUserId = userRow?.id
  if (!supabaseUserId) {
    return { ok: false, error: 'No Scout user record found for this account.' }
  }

  if (!userRow.profile_complete) {
    return {
      ok: false,
      error:
        'Complete your profile before Scout can apply. Go to Profile to finish one-time setup.',
    }
  }

  const plan = normalizeSubscriptionPlan(
    userRow.subscription_plan,
    userRow.is_pro,
  )
  const used = await countApplications(admin, supabaseUserId)
  const credits = buildApplicationCredits(plan, used)

  if (credits.remaining < 1) {
    return {
      ok: false,
      error: `Application credit limit reached (${credits.used}/${credits.limit}). Upgrade your plan for more applications.`,
    }
  }

  const insert = await admin
    .from('applications')
    .insert({
      user_id: supabaseUserId,
      job_id: input.jobId,
      company: input.company,
      role: input.role,
      url: input.url,
      status: 'queued',
    })
    .select('id')
    .maybeSingle()

  if (insert.error) {
    return { ok: false, error: insert.error.message }
  }

  const applicationId =
    (insert.data as { id?: string | null } | null)?.id ?? null
  return { ok: true, applicationId }
}
