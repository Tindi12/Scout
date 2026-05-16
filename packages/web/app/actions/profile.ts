'use server'

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

import type { TargetRole } from '@/app/actions/onboarding'
import {
  computeProfileCompletion,
  deriveRequiresSponsorship,
  type DegreeType,
  type HeardAboutUs,
  type ProfileData,
  type RemotePreference,
  type WorkAuthorization,
} from '@/lib/profile-completion'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const PROFILE_COLUMNS = [
  'id',
  'name',
  'phone_number',
  'linkedin_url',
  'github_url',
  'portfolio_url',
  'address_line',
  'city',
  'address_region',
  'postal_code',
  'country',
  'work_authorization',
  'cpt_eligible',
  'opt_eligible',
  'requires_sponsorship',
  'school',
  'degree_type',
  'major',
  'minor',
  'gpa',
  'grad_year',
  'target_roles',
  'preferred_locations',
  'remote_preference',
  'willing_to_relocate',
  'earliest_start_date',
  'heard_about_us',
  'default_cover_letter',
  'gender_identity',
  'race_ethnicity',
  'veteran_status',
  'disability_status',
  'profile_complete',
] as const

type ProfileRow = ProfileData & { id: string; profile_complete: boolean }

const ALLOWED_WORK_AUTH: ReadonlySet<WorkAuthorization> = new Set<WorkAuthorization>([
  'us_citizen',
  'green_card',
  'f1_student',
  'h1b',
  'other_visa',
  'not_authorized',
])

const ALLOWED_DEGREE: ReadonlySet<DegreeType> = new Set<DegreeType>([
  'associate',
  'bachelors',
  'masters',
  'phd',
])

const ALLOWED_REMOTE: ReadonlySet<RemotePreference> = new Set<RemotePreference>([
  'remote',
  'hybrid',
  'onsite',
  'no_preference',
])

const ALLOWED_HEARD: ReadonlySet<HeardAboutUs> = new Set<HeardAboutUs>([
  'linkedin',
  'company_website',
  'indeed',
  'referral',
  'career_fair',
  'other',
])

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const cleaned = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
  return cleaned
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  return allowed.has(value as T) ? (value as T) : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function asDate(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined
}

function buildUpdates(
  patch: Partial<ProfileData>,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {}

  const textKeys: Array<keyof ProfileData> = [
    'name',
    'phone_number',
    'linkedin_url',
    'github_url',
    'portfolio_url',
    'address_line',
    'city',
    'address_region',
    'postal_code',
    'country',
    'school',
    'major',
    'minor',
    'default_cover_letter',
    'gender_identity',
    'race_ethnicity',
    'veteran_status',
    'disability_status',
  ]

  for (const key of textKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      updates[key] = normalizeText(patch[key])
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'work_authorization')) {
    const v = pickEnum(patch.work_authorization, ALLOWED_WORK_AUTH)
    if (v !== undefined) updates.work_authorization = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'degree_type')) {
    const v = pickEnum(patch.degree_type, ALLOWED_DEGREE)
    if (v !== undefined) updates.degree_type = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'remote_preference')) {
    const v = pickEnum(patch.remote_preference, ALLOWED_REMOTE)
    if (v !== undefined) updates.remote_preference = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'heard_about_us')) {
    const v = pickEnum(patch.heard_about_us, ALLOWED_HEARD)
    if (v !== undefined) updates.heard_about_us = v
  }

  for (const key of ['cpt_eligible', 'opt_eligible', 'willing_to_relocate'] as const) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const v = asBoolean(patch[key])
      if (v !== undefined) updates[key] = v
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'gpa')) {
    const v = asNumber(patch.gpa)
    if (v !== undefined) updates.gpa = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'grad_year')) {
    const v = asNumber(patch.grad_year)
    if (v !== undefined) updates.grad_year = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'earliest_start_date')) {
    const v = asDate(patch.earliest_start_date)
    if (v !== undefined) updates.earliest_start_date = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'preferred_locations')) {
    const v = normalizeStringArray(patch.preferred_locations)
    if (v !== undefined) updates.preferred_locations = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'target_roles')) {
    const v = normalizeStringArray(patch.target_roles as unknown)
    if (v !== undefined) updates.target_roles = v as TargetRole[]
  }

  return updates
}

export async function getProfile(): Promise<
  { profile: ProfileRow } | { error: string }
> {
  const { userId } = await auth()
  if (!userId) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('users')
    .select(PROFILE_COLUMNS.join(', '))
    .eq('clerk_id', userId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Profile not found' }

  return { profile: data as unknown as ProfileRow }
}

export async function updateProfile(
  patch: Partial<ProfileData>,
): Promise<{ success: true } | { error: string }> {
  const { userId } = await auth()
  if (!userId) return { error: 'Unauthorized' }

  const updates = buildUpdates(patch)

  const { data: existing, error: fetchError } = await supabase
    .from('users')
    .select(PROFILE_COLUMNS.join(', '))
    .eq('clerk_id', userId)
    .maybeSingle()

  if (fetchError) return { error: fetchError.message }
  if (!existing) return { error: 'Profile not found' }

  const merged = { ...(existing as unknown as ProfileRow), ...updates } as ProfileRow

  if ('work_authorization' in updates) {
    merged.work_authorization = updates.work_authorization as
      | WorkAuthorization
      | null
    merged.requires_sponsorship = deriveRequiresSponsorship(
      merged.work_authorization,
    )
    if (merged.work_authorization !== 'f1_student') {
      merged.cpt_eligible = false
      merged.opt_eligible = false
    }
    updates.requires_sponsorship = merged.requires_sponsorship
    if (merged.work_authorization !== 'f1_student') {
      updates.cpt_eligible = false
      updates.opt_eligible = false
    }
  }

  const { profileComplete } = computeProfileCompletion(merged)
  updates.profile_complete = profileComplete

  if (Object.keys(updates).length === 0) {
    return { success: true }
  }

  const { error: updateError } = await supabase
    .from('users')
    .update(updates)
    .eq('clerk_id', userId)

  if (updateError) return { error: updateError.message }
  return { success: true }
}
