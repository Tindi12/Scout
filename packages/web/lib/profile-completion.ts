import type { TargetRole } from '@/app/actions/onboarding'

export type WorkAuthorization =
  | 'us_citizen'
  | 'green_card'
  | 'f1_student'
  | 'h1b'
  | 'other_visa'
  | 'not_authorized'

export type DegreeType = 'associate' | 'bachelors' | 'masters' | 'phd'

export type RemotePreference = 'remote' | 'hybrid' | 'onsite' | 'no_preference'

export type HeardAboutUs =
  | 'linkedin'
  | 'company_website'
  | 'indeed'
  | 'referral'
  | 'career_fair'
  | 'other'

/**
 * Shape of the profile data round-tripped between the page, the
 * server action, and the Supabase users row. Keys mirror DB columns.
 */
export type ProfileData = {
  // Personal / contact
  name: string | null
  phone_number: string | null
  linkedin_url: string | null
  github_url: string | null
  portfolio_url: string | null
  address_line: string | null
  city: string | null
  address_region: string | null
  postal_code: string | null
  country: string | null

  // Work authorization
  work_authorization: WorkAuthorization | null
  cpt_eligible: boolean
  opt_eligible: boolean
  requires_sponsorship: boolean | null

  // Education
  school: string | null
  degree_type: DegreeType | null
  major: string | null
  minor: string | null
  gpa: number | null
  grad_year: number | null

  // Job preferences
  target_roles: TargetRole[]
  preferred_locations: string[]
  remote_preference: RemotePreference | null
  willing_to_relocate: boolean
  earliest_start_date: string | null

  // Application defaults
  heard_about_us: HeardAboutUs | null
  default_cover_letter: string | null

  // Diversity
  gender_identity: string | null
  race_ethnicity: string | null
  veteran_status: string | null
  disability_status: string | null
}

export type ProfileCompletionFieldKey =
  | 'name'
  | 'phone_number'
  | 'linkedin_url'
  | 'work_authorization'
  | 'degree_type'
  | 'major'
  | 'preferred_locations'
  | 'remote_preference'
  | 'earliest_start_date'

export type ProfileCompletion = {
  percentage: number
  fieldsComplete: number
  fieldsTotal: number
  missingFieldKeys: ProfileCompletionFieldKey[]
  missingFieldLabels: string[]
  profileComplete: boolean
}

const REQUIRED_FIELDS: ReadonlyArray<{
  key: ProfileCompletionFieldKey
  label: string
}> = [
  { key: 'name', label: 'Full name' },
  { key: 'phone_number', label: 'Phone number' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'work_authorization', label: 'Work authorization' },
  { key: 'degree_type', label: 'Degree type' },
  { key: 'major', label: 'Major' },
  { key: 'preferred_locations', label: 'Preferred locations' },
  { key: 'remote_preference', label: 'Remote preference' },
  { key: 'earliest_start_date', label: 'Earliest start date' },
]

const PROFILE_COMPLETE_THRESHOLD = Math.ceil(REQUIRED_FIELDS.length * 0.8)

function isFilled(
  key: ProfileCompletionFieldKey,
  profile: Partial<ProfileData>,
): boolean {
  const value = profile[key]
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) {
    return value.some((entry) =>
      typeof entry === 'string' ? entry.trim().length > 0 : entry != null,
    )
  }
  return true
}

export function computeProfileCompletion(
  profile: Partial<ProfileData> | null | undefined,
): ProfileCompletion {
  const safe: Partial<ProfileData> = profile ?? {}
  const missing = REQUIRED_FIELDS.filter((field) => !isFilled(field.key, safe))
  const fieldsTotal = REQUIRED_FIELDS.length
  const fieldsComplete = fieldsTotal - missing.length
  const percentage = Math.round((fieldsComplete / fieldsTotal) * 100)
  return {
    percentage,
    fieldsComplete,
    fieldsTotal,
    missingFieldKeys: missing.map((m) => m.key),
    missingFieldLabels: missing.map((m) => m.label),
    profileComplete: fieldsComplete >= PROFILE_COMPLETE_THRESHOLD,
  }
}

const SPONSORSHIP_NOT_REQUIRED = new Set<WorkAuthorization>([
  'us_citizen',
  'green_card',
])

export function deriveRequiresSponsorship(
  status: WorkAuthorization | null | undefined,
): boolean | null {
  if (!status) return null
  return !SPONSORSHIP_NOT_REQUIRED.has(status)
}
