import { clerkClient } from '@clerk/nextjs/server'

import {
  getSupabaseUserByClerkId,
  type SupabaseUserSnapshot,
} from '@/lib/supabase-user-status'
import { createClient } from '@supabase/supabase-js'

export type { SupabaseUserSnapshot }

export async function ensureSupabaseUser(
  clerkId: string,
): Promise<SupabaseUserSnapshot | null> {
  const existing = await getSupabaseUserByClerkId(clerkId)
  if (existing) return existing

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkId)
  const email = clerkUser.emailAddresses[0]?.emailAddress
  if (!email) return null

  const name =
    `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() || null

  const { data: created, error: insertError } = await admin
    .from('users')
    .insert({
      clerk_id: clerkId,
      email,
      name,
      is_pro: false,
      onboarding_complete: false,
      profile_complete: false,
      copilot_messages_used: 0,
    })
    .select('id, onboarding_complete, profile_complete')
    .single()

  if (insertError || !created?.id) return null

  return {
    id: String(created.id),
    onboarding_complete: Boolean(created.onboarding_complete),
    profile_complete: Boolean(created.profile_complete),
  }
}
