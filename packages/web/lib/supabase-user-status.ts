import { createClient } from '@supabase/supabase-js'

export type SupabaseUserSnapshot = {
  id: string
  onboarding_complete: boolean
  profile_complete: boolean
}

export async function getSupabaseUserByClerkId(
  clerkId: string,
): Promise<SupabaseUserSnapshot | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin
    .from('users')
    .select('id, onboarding_complete, profile_complete')
    .eq('clerk_id', clerkId)
    .maybeSingle()

  if (error || !data?.id) return null

  return {
    id: String(data.id),
    onboarding_complete: Boolean(data.onboarding_complete),
    profile_complete: Boolean(data.profile_complete),
  }
}
