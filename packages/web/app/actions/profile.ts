'use server'

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

import type { TargetRole } from '@/app/actions/onboarding'
import {
  computeProfileCompletion,
  deriveRequiresSponsorship,
  type DegreeType,
  type HeardAboutUs,
  type ProfileData as BaseProfileData,
  type RemotePreference,
  type SecurityClearanceStatus,
  type WorkAuthorization,
} from '@/lib/profile-completion'

export type OpenEndedPreference = 'auto' | 'library' | 'sms' | 'email'

export type AnswersLibrary = {
  why_company?: string
  career_goals?: string
  about_yourself?: string
  why_hire_me?: string
  greatest_strength?: string
  greatest_weakness?: string
  challenge_overcome?: string
  proud_projects?: string
}

export type ProfileData = BaseProfileData & {
  open_ended_preference: string | null
  answers_library: AnswersLibrary
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const PROFILE_COLUMNS = [
  'id',
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
  'security_clearance_status',
  'security_clearances',
  'willing_to_obtain_clearance',
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
  'gender_identity',
  'race_ethnicity',
  'veteran_status',
  'disability_status',
  'open_ended_preference',
  'answers_library',
  'generate_cover_letters',
  'profile_complete',
] as const

// Secrets/credentials that must never be read into a profile payload. PROFILE_COLUMNS
// is an allowlist so these are already excluded; this guard trips at module load if
// one is ever added by mistake.
const NEVER_EXPOSE = ['usajobs_password', 'usajobs_email'] as const
for (const col of NEVER_EXPOSE) {
  if ((PROFILE_COLUMNS as readonly string[]).includes(col)) {
    throw new Error(`Security: ${col} must never be selected into a profile payload`)
  }
}

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

const ALLOWED_OPEN_ENDED: ReadonlySet<OpenEndedPreference> =
  new Set<OpenEndedPreference>(['auto', 'library', 'sms', 'email'])

const ALLOWED_CLEARANCE_STATUS: ReadonlySet<SecurityClearanceStatus> =
  new Set<SecurityClearanceStatus>(['none', 'active', 'inactive'])

const CLEARANCE_MAX_ENTRIES = 10
const CLEARANCE_MAX_LENGTH = 80

function normalizeClearances(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim().slice(0, CLEARANCE_MAX_LENGTH)
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(trimmed)
    if (cleaned.length >= CLEARANCE_MAX_ENTRIES) break
  }
  return cleaned
}

const ANSWERS_LIBRARY_KEYS = [
  'why_company',
  'career_goals',
  'about_yourself',
  'why_hire_me',
  'greatest_strength',
  'greatest_weakness',
  'challenge_overcome',
  'proud_projects',
] as const satisfies ReadonlyArray<keyof AnswersLibrary>

function normalizeAnswersLibrary(value: unknown): AnswersLibrary | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const source = value as Record<string, unknown>
  const normalized: AnswersLibrary = {}
  for (const key of ANSWERS_LIBRARY_KEYS) {
    const entry = source[key]
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    normalized[key] = trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed
  }
  return normalized
}

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

// Accepts a month input ("YYYY-MM") or a full date and stores a full DATE
// (day pinned to 01 for month-only input). The education_*_date columns are DATE.
function asMonthDate(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
  return undefined
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
    'address_street',
    'address_city',
    'address_state',
    'address_zip',
    'address_country',
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

  if (Object.prototype.hasOwnProperty.call(patch, 'security_clearance_status')) {
    const v = pickEnum(patch.security_clearance_status, ALLOWED_CLEARANCE_STATUS)
    if (v !== undefined) updates.security_clearance_status = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'security_clearances')) {
    const v = normalizeClearances(patch.security_clearances)
    if (v !== undefined) updates.security_clearances = v
  }

  for (const key of [
    'cpt_eligible',
    'opt_eligible',
    'willing_to_relocate',
    'generate_cover_letters',
    'willing_to_obtain_clearance',
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const v = asBoolean(patch[key])
      if (v !== undefined) updates[key] = v
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'gpa')) {
    const v = asNumber(patch.gpa)
    if (v !== undefined) updates.gpa = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'education_start_date')) {
    const v = asMonthDate(patch.education_start_date)
    if (v !== undefined) updates.education_start_date = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'education_end_date')) {
    const v = asMonthDate(patch.education_end_date)
    if (v !== undefined) updates.education_end_date = v
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

  if (Object.prototype.hasOwnProperty.call(patch, 'open_ended_preference')) {
    const v = pickEnum(patch.open_ended_preference, ALLOWED_OPEN_ENDED)
    if (v !== undefined) updates.open_ended_preference = v
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'answers_library')) {
    const v = normalizeAnswersLibrary(patch.answers_library)
    if (v !== undefined) updates.answers_library = v
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

  if ('answers_library' in updates) {
    const existingLibrary = normalizeAnswersLibrary(
      (existing as unknown as ProfileRow).answers_library,
    ) ?? {}
    updates.answers_library = {
      ...existingLibrary,
      ...(updates.answers_library as AnswersLibrary),
    }
    merged.answers_library = updates.answers_library as AnswersLibrary
  }

  if ('security_clearance_status' in updates) {
    const status = updates.security_clearance_status as SecurityClearanceStatus | null
    if (status === 'none' || status === null) {
      updates.security_clearances = []
    }
  }

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
