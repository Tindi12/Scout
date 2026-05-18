'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type TargetRole =
  | 'swe'
  | 'ml'
  | 'environmental_eng'
  | 'aerospace_eng'
  | 'nuclear_eng'
  | 'research'
  | 'chem_eng'
  | 'mech_eng'
  | 'elec_eng'
  | 'civil_eng'
  | 'bio_eng'
  | 'industrial_eng'

export type OnboardingData = {
  name: string
  school: string
  grad_year: number
  gpa?: number
  target_roles: TargetRole[]
  phone_number?: string
}


export async function completeOnboarding(data: OnboardingData) {
  const { userId } = await auth()

  if (!userId) throw new Error("Unauthorized")
    
  const client = await clerkClient()

  // Get email from Clerk
  const clerkUser = await client.users.getUser(userId)
  const email = clerkUser.emailAddresses[0]?.emailAddress

if (!email) throw new Error("No email found")

  const { error } = await supabase
    .from('users')
    .insert({
      clerk_id: userId,
      name: data.name,
      email: email,
      school: data.school,
      grad_year: data.grad_year,
      gpa: data.gpa ?? null,
      target_roles: data.target_roles,
      phone_number: data.phone_number ?? null,
      onboarding_complete: true,
      is_pro: false,
      copilot_messages_used: 0,
    })

  if (error) {
    console.error('Supabase insert error:', error)
    throw new Error('Failed to save onboarding data')
  }

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      onboardingComplete: true,
    },
  })

  return { success: true }
}
