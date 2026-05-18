'use server'

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export type QueueApplicationInput = {
  jobId: string
  company: string
  role: string
  url: string
}

export type QueueApplicationResult =
  | { ok: true; applicationId: string | null }
  | { ok: false; error: string }

export async function queueApplication(
  input: QueueApplicationInput,
): Promise<QueueApplicationResult> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, error: 'Unauthorized' }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) {
    return {
      ok: false,
      error:
        'Server misconfigured: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.',
    }
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const userLookup = await admin
    .from('users')
    .select('id')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (userLookup.error) {
    return { ok: false, error: `Failed to load user: ${userLookup.error.message}` }
  }

  const supabaseUserId = (userLookup.data as { id?: string } | null)?.id
  if (!supabaseUserId) {
    return { ok: false, error: 'No Scout user record found for this account.' }
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
