'use client'

import { useUser } from '@clerk/nextjs'
import {
  ChevronDown,
  FileText,
  GraduationCap,
  Heart,
  MapPin,
  Shield,
  User,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import 'react-phone-number-input/style.css'

import { getProfile, updateProfile } from '@/app/actions/profile'
import type { TargetRole } from '@/app/actions/onboarding'
import { CompactRoleGrid } from '@/components/profile/CompactRoleGrid'
import { CoverLetterOpeningInfo } from '@/components/profile/CoverLetterOpeningInfo'
import { FieldRow, type FieldStatus } from '@/components/profile/FieldRow'
import { LocationChips } from '@/components/profile/LocationChips'
import { PillGroup } from '@/components/profile/PillGroup'
import {
  ProfileInput,
  ProfileLockedInput,
  ProfileSelect,
  ProfileTextarea,
} from '@/components/profile/inputs'
import { ProfileProgress } from '@/components/profile/ProfileProgress'
import { ProfileSection } from '@/components/profile/ProfileSection'
import { SchoolAutocomplete } from '@/components/profile/SchoolAutocomplete'
import { Toggle } from '@/components/profile/Toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  computeProfileCompletion,
  type DegreeType,
  type HeardAboutUs,
  type ProfileData,
  type RemotePreference,
  type WorkAuthorization,
} from '@/lib/profile-completion'
import { cn } from '@/lib/utils'

type SectionId =
  | 'personal'
  | 'authorization'
  | 'education'
  | 'preferences'
  | 'application'
  | 'diversity'

const EMPTY_PROFILE: ProfileData = {
  name: null,
  phone_number: null,
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  address_line: null,
  city: null,
  address_region: null,
  postal_code: null,
  country: 'United States',
  work_authorization: null,
  cpt_eligible: false,
  opt_eligible: false,
  requires_sponsorship: null,
  school: null,
  degree_type: null,
  major: null,
  minor: null,
  gpa: null,
  grad_year: null,
  target_roles: [],
  preferred_locations: [],
  remote_preference: null,
  willing_to_relocate: false,
  earliest_start_date: null,
  heard_about_us: null,
  default_cover_letter: null,
  gender_identity: null,
  race_ethnicity: null,
  veteran_status: null,
  disability_status: null,
}

const WORK_AUTH_OPTIONS: ReadonlyArray<{ value: WorkAuthorization; label: string }> = [
  { value: 'us_citizen', label: 'US Citizen' },
  { value: 'green_card', label: 'Permanent Resident' },
  { value: 'f1_student', label: 'F-1 Student' },
  { value: 'h1b', label: 'H-1B Visa' },
  { value: 'other_visa', label: 'Other Visa' },
  { value: 'not_authorized', label: 'Not Authorized' },
]

const DEGREE_OPTIONS: ReadonlyArray<{ value: DegreeType; label: string }> = [
  { value: 'associate', label: 'Associate' },
  { value: 'bachelors', label: "Bachelor's" },
  { value: 'masters', label: "Master's" },
  { value: 'phd', label: 'PhD' },
]

const GRAD_YEAR_OPTIONS = [2025, 2026, 2027, 2028, 2029] as const

const REMOTE_OPTIONS: ReadonlyArray<{ value: RemotePreference; label: string }> = [
  { value: 'remote', label: 'Remote Only' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
  { value: 'no_preference', label: 'No Preference' },
]

const HEARD_OPTIONS: ReadonlyArray<{ value: HeardAboutUs; label: string }> = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'company_website', label: 'Company Website' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'referral', label: 'Referral' },
  { value: 'career_fair', label: 'Career Fair' },
  { value: 'other', label: 'Other' },
]

const COMMON_MAJORS = [
  'Computer Science',
  'Computer Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Biomedical Engineering',
  'Industrial Engineering',
  'Data Science',
  'Information Systems',
  'Mathematics',
  'Physics',
  'Statistics',
  'Business Administration',
  'Economics',
] as const

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming','District of Columbia',
]
const STATE_OPTIONS = [
  ...US_STATES.map((name) => ({ value: name, label: name })),
  { value: 'International', label: 'International' },
]

const GENDER_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'man', label: 'Man' },
  { value: 'woman', label: 'Woman' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'self_describe', label: 'Prefer to self-describe' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]
const RACE_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'american_indian', label: 'American Indian or Alaska Native' },
  { value: 'asian', label: 'Asian' },
  { value: 'black', label: 'Black or African American' },
  { value: 'hispanic', label: 'Hispanic or Latino' },
  { value: 'pacific_islander', label: 'Native Hawaiian or Pacific Islander' },
  { value: 'white', label: 'White' },
  { value: 'two_or_more', label: 'Two or more races' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]
const VETERAN_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'not_veteran', label: 'Not a veteran' },
  { value: 'veteran', label: 'Veteran' },
  { value: 'active_duty', label: 'Active duty' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]
const DISABILITY_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'no', label: 'No disability' },
  { value: 'yes', label: 'Yes, I have a disability' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

function fmtToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtTwoYearsOut(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 2)
  return d.toISOString().slice(0, 10)
}

type FieldKey = keyof ProfileData
type FieldStatusMap = Partial<Record<FieldKey, FieldStatus>>
type FieldErrorMap = Partial<Record<FieldKey, string | undefined>>

export default function ProfilePage() {
  const { user } = useUser()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE)
  const baselineRef = useRef<ProfileData>(EMPTY_PROFILE)
  const [statusByField, setStatusByField] = useState<FieldStatusMap>({})
  const [errorByField, setErrorByField] = useState<FieldErrorMap>({})
  const [addressOpen, setAddressOpen] = useState(true)
  const [diversityOpen, setDiversityOpen] = useState(true)
  const savedTimeouts = useRef<Map<FieldKey, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await getProfile()
      if (cancelled) return
      if ('profile' in result) {
        const merged: ProfileData = { ...EMPTY_PROFILE }
        const row = result.profile as unknown as Partial<ProfileData>
        for (const key of Object.keys(merged) as FieldKey[]) {
          const value = row[key]
          if (value !== undefined) {
            ;(merged as Record<FieldKey, unknown>)[key] = value as never
          }
        }
        setProfile(merged)
        baselineRef.current = merged
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timeouts = savedTimeouts.current
    return () => {
      timeouts.forEach((handle) => clearTimeout(handle))
      timeouts.clear()
    }
  }, [])

  const setFieldStatus = useCallback(
    (key: FieldKey, status: FieldStatus, error?: string) => {
      setStatusByField((prev) => ({ ...prev, [key]: status }))
      setErrorByField((prev) => ({ ...prev, [key]: error }))
    },
    [],
  )

  const showSectionToast = useCallback(
    (_section: SectionId, label: string) => {
      toast({
        title: 'Saved',
        description: label,
        duration: 1800,
      })
    },
    [toast],
  )

  const flashSaved = useCallback((key: FieldKey) => {
    const existing = savedTimeouts.current.get(key)
    if (existing) clearTimeout(existing)
    const handle = setTimeout(() => {
      setStatusByField((prev) => {
        if (prev[key] !== 'saved') return prev
        return { ...prev, [key]: 'idle' }
      })
      savedTimeouts.current.delete(key)
    }, 2000)
    savedTimeouts.current.set(key, handle)
  }, [])

  const equalValue = (a: unknown, b: unknown): boolean => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((value, index) => value === b[index])
    }
    return a === b
  }

  const persistField = useCallback(
    async (key: FieldKey, value: ProfileData[FieldKey], section: SectionId, label: string) => {
      const previous = baselineRef.current[key]
      if (equalValue(previous, value)) return
      setFieldStatus(key, 'saving')
      const patch: Partial<ProfileData> = { [key]: value } as Partial<ProfileData>
      const result = await updateProfile(patch)
      if ('error' in result) {
        setFieldStatus(key, 'error', result.error)
        return
      }
      baselineRef.current = { ...baselineRef.current, [key]: value }
      setFieldStatus(key, 'saved')
      flashSaved(key)
      showSectionToast(section, `${label} updated`)
    },
    [flashSaved, setFieldStatus, showSectionToast],
  )

  const updateLocal = useCallback(
    <K extends FieldKey>(key: K, value: ProfileData[K]) => {
      setProfile((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  // Pill / select / toggle changes save immediately on selection.
  const commitImmediate = useCallback(
    async <K extends FieldKey>(
      key: K,
      value: ProfileData[K],
      section: SectionId,
      label: string,
    ) => {
      updateLocal(key, value)
      // For work_authorization, optimistically clear CPT/OPT locally if leaving F-1
      if (key === 'work_authorization' && value !== 'f1_student') {
        setProfile((prev) => ({
          ...prev,
          cpt_eligible: false,
          opt_eligible: false,
        }))
      }
      await persistField(key, value, section, label)
    },
    [persistField, updateLocal],
  )

  const completion = useMemo(() => computeProfileCompletion(profile), [profile])

  const sectionComplete = useMemo(() => {
    const trimmed = (value: string | null | undefined) => Boolean(value?.trim())
    return {
      personal:
        trimmed(profile.name) &&
        trimmed(profile.phone_number) &&
        trimmed(profile.linkedin_url),
      authorization: Boolean(profile.work_authorization),
      education:
        trimmed(profile.school) &&
        Boolean(profile.degree_type) &&
        trimmed(profile.major) &&
        Boolean(profile.grad_year),
      preferences:
        profile.preferred_locations.length > 0 &&
        Boolean(profile.remote_preference) &&
        Boolean(profile.earliest_start_date),
      application: Boolean(profile.heard_about_us),
      diversity: true,
    }
  }, [profile])

  const phoneHasValue = Boolean(profile.phone_number?.trim())
  const phoneValid =
    !phoneHasValue || isValidPhoneNumber(profile.phone_number ?? '')

  if (loading) {
    return <ProfileSkeleton />
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-10">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#444]">
          Scout Profile
        </p>
        <h1 className="font-headline text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
          Your Profile
        </h1>
        <p className="text-sm text-[#888]">
          Scout uses this to apply on your behalf. Keep it accurate.
        </p>
      </header>

      <ProfileProgress
        percentage={completion.percentage}
        fieldsComplete={completion.fieldsComplete}
        fieldsTotal={completion.fieldsTotal}
        missingFieldLabels={completion.missingFieldLabels}
      />

      <ProfileSection
        title="Personal Information"
        icon={User}
        description="Basic contact info Scout fills on every application"
        complete={sectionComplete.personal}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FieldRow
            htmlFor="profile-name"
            label="Full name"
            status={statusByField.name}
            errorMessage={errorByField.name}
          >
            <ProfileInput
              id="profile-name"
              value={profile.name ?? ''}
              onValueChange={(value) => updateLocal('name', value)}
              onBlur={() =>
                void persistField('name', profile.name, 'personal', 'Name')
              }
              placeholder="Alex Johnson"
              autoComplete="name"
            />
          </FieldRow>

          <FieldRow label="Email" helper="Managed by your account">
            <ProfileLockedInput
              id="profile-email"
              value={user?.primaryEmailAddress?.emailAddress ?? ''}
              tooltip="Managed by your account"
            />
          </FieldRow>

          <FieldRow
            htmlFor="profile-phone"
            label="Phone number"
            status={statusByField.phone_number}
            errorMessage={
              !phoneValid
                ? 'Please enter a valid phone number'
                : errorByField.phone_number
            }
          >
            <PhoneInput
              id="profile-phone"
              defaultCountry="US"
              international
              countryCallingCodeEditable={false}
              value={profile.phone_number ?? undefined}
              onChange={(value) => updateLocal('phone_number', value ?? null)}
              onBlur={() => {
                const value = profile.phone_number ?? null
                if (value && !isValidPhoneNumber(value)) {
                  setFieldStatus('phone_number', 'error', 'Invalid phone number')
                  return
                }
                void persistField('phone_number', value, 'personal', 'Phone')
              }}
              placeholder="+1 (555) 000-0000"
            />
          </FieldRow>

          <FieldRow
            htmlFor="profile-linkedin"
            label="LinkedIn URL"
            status={statusByField.linkedin_url}
            errorMessage={errorByField.linkedin_url}
          >
            <ProfileInput
              id="profile-linkedin"
              value={profile.linkedin_url ?? ''}
              onValueChange={(value) => updateLocal('linkedin_url', value)}
              onBlur={() =>
                void persistField(
                  'linkedin_url',
                  profile.linkedin_url,
                  'personal',
                  'LinkedIn',
                )
              }
              placeholder="linkedin.com/in/yourname"
            />
          </FieldRow>

          <FieldRow
            htmlFor="profile-github"
            label="GitHub URL"
            optional
            status={statusByField.github_url}
            errorMessage={errorByField.github_url}
          >
            <ProfileInput
              id="profile-github"
              value={profile.github_url ?? ''}
              onValueChange={(value) => updateLocal('github_url', value)}
              onBlur={() =>
                void persistField(
                  'github_url',
                  profile.github_url,
                  'personal',
                  'GitHub',
                )
              }
              placeholder="github.com/yourusername"
            />
          </FieldRow>

          <FieldRow
            htmlFor="profile-portfolio"
            label="Portfolio / website"
            optional
            status={statusByField.portfolio_url}
            errorMessage={errorByField.portfolio_url}
          >
            <ProfileInput
              id="profile-portfolio"
              value={profile.portfolio_url ?? ''}
              onValueChange={(value) => updateLocal('portfolio_url', value)}
              onBlur={() =>
                void persistField(
                  'portfolio_url',
                  profile.portfolio_url,
                  'personal',
                  'Portfolio',
                )
              }
              placeholder="yourportfolio.com"
            />
          </FieldRow>
        </div>

        <Collapsible
          label="Mailing Address"
          open={addressOpen}
          onToggle={() => setAddressOpen((prev) => !prev)}
        >
          <div className="grid grid-cols-1 gap-4 pt-3 md:grid-cols-2">
            <FieldRow
              htmlFor="profile-street"
              label="Street address"
              optional
              status={statusByField.address_line}
              errorMessage={errorByField.address_line}
              className="md:col-span-2"
            >
              <ProfileInput
                id="profile-street"
                value={profile.address_line ?? ''}
                onValueChange={(value) => updateLocal('address_line', value)}
                onBlur={() =>
                  void persistField(
                    'address_line',
                    profile.address_line,
                    'personal',
                    'Address',
                  )
                }
                placeholder="1234 Main St"
              />
            </FieldRow>

            <FieldRow
              htmlFor="profile-city"
              label="City"
              optional
              status={statusByField.city}
              errorMessage={errorByField.city}
            >
              <ProfileInput
                id="profile-city"
                value={profile.city ?? ''}
                onValueChange={(value) => updateLocal('city', value)}
                onBlur={() => void persistField('city', profile.city, 'personal', 'City')}
                placeholder="San Francisco"
              />
            </FieldRow>

            <FieldRow
              label="State"
              optional
              status={statusByField.address_region}
              errorMessage={errorByField.address_region}
            >
              <ProfileSelect
                value={profile.address_region ?? ''}
                onValueChange={(value) =>
                  void commitImmediate(
                    'address_region',
                    value || null,
                    'personal',
                    'State',
                  )
                }
                options={STATE_OPTIONS}
                placeholder="Select…"
              />
            </FieldRow>

            <FieldRow
              htmlFor="profile-zip"
              label="Zip / Postal code"
              optional
              status={statusByField.postal_code}
              errorMessage={errorByField.postal_code}
            >
              <ProfileInput
                id="profile-zip"
                value={profile.postal_code ?? ''}
                onValueChange={(value) => updateLocal('postal_code', value)}
                onBlur={() =>
                  void persistField(
                    'postal_code',
                    profile.postal_code,
                    'personal',
                    'Postal code',
                  )
                }
                placeholder="94110"
              />
            </FieldRow>

            <FieldRow
              htmlFor="profile-country"
              label="Country"
              optional
              status={statusByField.country}
              errorMessage={errorByField.country}
            >
              <ProfileInput
                id="profile-country"
                value={profile.country ?? ''}
                onValueChange={(value) => updateLocal('country', value)}
                onBlur={() =>
                  void persistField(
                    'country',
                    profile.country,
                    'personal',
                    'Country',
                  )
                }
                placeholder="United States"
              />
            </FieldRow>
          </div>
        </Collapsible>
      </ProfileSection>

      <ProfileSection
        title="Work Authorization"
        icon={Shield}
        description="Scout answers visa questions correctly on every application. Critical for international students."
        complete={sectionComplete.authorization}
      >
        <FieldRow
          label="Work Authorization Status"
          status={statusByField.work_authorization}
          errorMessage={errorByField.work_authorization}
        >
          <PillGroup<WorkAuthorization>
            ariaLabel="Work authorization"
            options={WORK_AUTH_OPTIONS}
            value={profile.work_authorization}
            onChange={(value) =>
              void commitImmediate(
                'work_authorization',
                value,
                'authorization',
                'Authorization',
              )
            }
          />
        </FieldRow>

        {profile.work_authorization === 'f1_student' && (
          <div className="space-y-3">
            <Toggle
              id="cpt"
              label="CPT Eligible"
              checked={profile.cpt_eligible}
              onChange={(value) =>
                void commitImmediate(
                  'cpt_eligible',
                  value,
                  'authorization',
                  'CPT eligibility',
                )
              }
            />
            <Toggle
              id="opt"
              label="OPT Eligible"
              checked={profile.opt_eligible}
              onChange={(value) =>
                void commitImmediate(
                  'opt_eligible',
                  value,
                  'authorization',
                  'OPT eligibility',
                )
              }
            />
            <p className="text-xs text-[#666]">
              Scout will only apply to companies that accept CPT/OPT when this is selected.
            </p>
          </div>
        )}

        <SponsorshipBanner status={profile.work_authorization} />
      </ProfileSection>

      <ProfileSection
        title="Education"
        icon={GraduationCap}
        description="Scout uses this to fill education fields on applications"
        complete={sectionComplete.education}
      >
        <FieldRow
          htmlFor="profile-school"
          label="School"
          status={statusByField.school}
          errorMessage={errorByField.school}
        >
          <SchoolAutocomplete
            id="profile-school"
            value={profile.school ?? ''}
            onChange={(value) => updateLocal('school', value)}
            onCommit={(value) =>
              void persistField('school', value || null, 'education', 'School')
            }
          />
        </FieldRow>

        <FieldRow
          label="Degree type"
          status={statusByField.degree_type}
          errorMessage={errorByField.degree_type}
        >
          <PillGroup<DegreeType>
            ariaLabel="Degree type"
            options={DEGREE_OPTIONS}
            value={profile.degree_type}
            onChange={(value) =>
              void commitImmediate('degree_type', value, 'education', 'Degree')
            }
          />
        </FieldRow>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FieldRow
            htmlFor="profile-major"
            label="Major"
            status={statusByField.major}
            errorMessage={errorByField.major}
          >
            <ProfileInput
              id="profile-major"
              list="profile-major-list"
              value={profile.major ?? ''}
              onValueChange={(value) => updateLocal('major', value)}
              onBlur={() =>
                void persistField('major', profile.major, 'education', 'Major')
              }
              placeholder="Computer Science"
            />
            <datalist id="profile-major-list">
              {COMMON_MAJORS.map((major) => (
                <option key={major} value={major} />
              ))}
            </datalist>
          </FieldRow>

          <FieldRow
            htmlFor="profile-minor"
            label="Minor"
            optional
            status={statusByField.minor}
            errorMessage={errorByField.minor}
          >
            <ProfileInput
              id="profile-minor"
              value={profile.minor ?? ''}
              onValueChange={(value) => updateLocal('minor', value)}
              onBlur={() =>
                void persistField('minor', profile.minor, 'education', 'Minor')
              }
              placeholder="Mathematics"
            />
          </FieldRow>

          <FieldRow
            htmlFor="profile-gpa"
            label="GPA"
            optional
            status={statusByField.gpa}
            errorMessage={errorByField.gpa}
          >
            <ProfileInput
              id="profile-gpa"
              type="number"
              step="0.1"
              min="0"
              max="4"
              inputMode="decimal"
              value={profile.gpa == null ? '' : String(profile.gpa)}
              onValueChange={(value) => {
                const parsed = value === '' ? null : Number(value)
                updateLocal(
                  'gpa',
                  parsed === null || Number.isNaN(parsed) ? null : parsed,
                )
              }}
              onBlur={() =>
                void persistField('gpa', profile.gpa, 'education', 'GPA')
              }
              placeholder="3.8"
            />
          </FieldRow>

          <FieldRow
            label="Graduation year"
            status={statusByField.grad_year}
            errorMessage={errorByField.grad_year}
          >
            <PillGroup<string>
              ariaLabel="Graduation year"
              options={GRAD_YEAR_OPTIONS.map((year) => ({
                value: String(year),
                label: String(year),
              }))}
              value={profile.grad_year ? String(profile.grad_year) : null}
              onChange={(value) =>
                void commitImmediate(
                  'grad_year',
                  Number(value),
                  'education',
                  'Graduation year',
                )
              }
            />
          </FieldRow>
        </div>
      </ProfileSection>

      <ProfileSection
        title="Job Preferences"
        icon={MapPin}
        description="Scout uses these to filter and prioritize which roles to apply to"
        complete={sectionComplete.preferences}
      >
        <FieldRow
          label="Target roles"
          status={statusByField.target_roles}
          errorMessage={errorByField.target_roles}
        >
          <CompactRoleGrid
            selected={profile.target_roles}
            onToggle={(role) => {
              const set = new Set(profile.target_roles)
              if (set.has(role)) set.delete(role)
              else set.add(role)
              const next = Array.from(set) as TargetRole[]
              void commitImmediate(
                'target_roles',
                next,
                'preferences',
                'Target roles',
              )
            }}
          />
        </FieldRow>

        <FieldRow
          label="Preferred locations"
          status={statusByField.preferred_locations}
          errorMessage={errorByField.preferred_locations}
        >
          <LocationChips
            values={profile.preferred_locations}
            onChange={(next) =>
              void commitImmediate(
                'preferred_locations',
                next,
                'preferences',
                'Preferred locations',
              )
            }
          />
        </FieldRow>

        <FieldRow
          label="Remote preference"
          status={statusByField.remote_preference}
          errorMessage={errorByField.remote_preference}
        >
          <PillGroup<RemotePreference>
            ariaLabel="Remote preference"
            options={REMOTE_OPTIONS}
            value={profile.remote_preference}
            onChange={(value) =>
              void commitImmediate(
                'remote_preference',
                value,
                'preferences',
                'Remote preference',
              )
            }
          />
        </FieldRow>

        <Toggle
          id="willing-relocate"
          label="Willing to relocate for the right role"
          checked={profile.willing_to_relocate}
          onChange={(value) =>
            void commitImmediate(
              'willing_to_relocate',
              value,
              'preferences',
              'Relocation',
            )
          }
        />

        <FieldRow
          htmlFor="profile-start"
          label="Earliest available start date"
          status={statusByField.earliest_start_date}
          errorMessage={errorByField.earliest_start_date}
        >
          <ProfileInput
            id="profile-start"
            type="date"
            min={fmtToday()}
            max={fmtTwoYearsOut()}
            value={profile.earliest_start_date ?? ''}
            onValueChange={(value) => updateLocal('earliest_start_date', value || null)}
            onBlur={() =>
              void persistField(
                'earliest_start_date',
                profile.earliest_start_date,
                'preferences',
                'Start date',
              )
            }
          />
        </FieldRow>
      </ProfileSection>

      <ProfileSection
        title="Application Defaults"
        icon={FileText}
        description="Default answers Scout uses for common application questions"
        complete={sectionComplete.application}
      >
        <FieldRow
          label="How did you hear about us?"
          status={statusByField.heard_about_us}
          errorMessage={errorByField.heard_about_us}
        >
          <PillGroup<HeardAboutUs>
            ariaLabel="How did you hear about us"
            options={HEARD_OPTIONS}
            value={profile.heard_about_us}
            onChange={(value) =>
              void commitImmediate(
                'heard_about_us',
                value,
                'application',
                'Referral source',
              )
            }
          />
        </FieldRow>

        <FieldRow
          htmlFor="profile-cover"
          label="Default cover letter opening"
          optional
          labelInfo={<CoverLetterOpeningInfo />}
          status={statusByField.default_cover_letter}
          errorMessage={errorByField.default_cover_letter}
        >
          <CoverLetterInput
            value={profile.default_cover_letter ?? ''}
            onChange={(value) => updateLocal('default_cover_letter', value)}
            onBlur={() =>
              void persistField(
                'default_cover_letter',
                profile.default_cover_letter,
                'application',
                'Cover letter',
              )
            }
          />
        </FieldRow>
      </ProfileSection>

      <ProfileSection
        title="Diversity (Optional)"
        icon={Heart}
        description="Many applications ask diversity questions. All fields are completely optional. Scout fills exactly what you specify."
        complete
      >
        <Collapsible
          label={diversityOpen ? 'Hide diversity questions' : 'Expand diversity questions'}
          open={diversityOpen}
          onToggle={() => setDiversityOpen((prev) => !prev)}
        >
          <div className="space-y-4 pt-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-[#888]">
              These fields are 100% optional. Companies use this data for EEOC
              reporting only. Your answers do not affect hiring decisions. Scout
              will only fill these if you provide them.
            </div>

            <FieldRow
              label="Gender identity"
              optional
              status={statusByField.gender_identity}
              errorMessage={errorByField.gender_identity}
            >
              <ProfileSelect
                value={profile.gender_identity ?? ''}
                onValueChange={(value) =>
                  void commitImmediate(
                    'gender_identity',
                    value || null,
                    'diversity',
                    'Gender identity',
                  )
                }
                options={GENDER_OPTIONS}
              />
            </FieldRow>

            <FieldRow
              label="Race / Ethnicity"
              optional
              status={statusByField.race_ethnicity}
              errorMessage={errorByField.race_ethnicity}
            >
              <ProfileSelect
                value={profile.race_ethnicity ?? ''}
                onValueChange={(value) =>
                  void commitImmediate(
                    'race_ethnicity',
                    value || null,
                    'diversity',
                    'Race / ethnicity',
                  )
                }
                options={RACE_OPTIONS}
              />
            </FieldRow>

            <FieldRow
              label="Veteran status"
              optional
              status={statusByField.veteran_status}
              errorMessage={errorByField.veteran_status}
            >
              <ProfileSelect
                value={profile.veteran_status ?? ''}
                onValueChange={(value) =>
                  void commitImmediate(
                    'veteran_status',
                    value || null,
                    'diversity',
                    'Veteran status',
                  )
                }
                options={VETERAN_OPTIONS}
              />
            </FieldRow>

            <FieldRow
              label="Disability status"
              optional
              status={statusByField.disability_status}
              errorMessage={errorByField.disability_status}
            >
              <ProfileSelect
                value={profile.disability_status ?? ''}
                onValueChange={(value) =>
                  void commitImmediate(
                    'disability_status',
                    value || null,
                    'diversity',
                    'Disability status',
                  )
                }
                options={DISABILITY_OPTIONS}
              />
            </FieldRow>
          </div>
        </Collapsible>
      </ProfileSection>
    </div>
  )
}

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-white/[0.05] pt-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-sm text-[#888] transition-colors hover:text-white"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-[#666] transition-transform duration-200',
            open && 'rotate-180',
          )}
          strokeWidth={1.75}
        />
      </button>
      {open && children}
    </div>
  )
}

function SponsorshipBanner({
  status,
}: {
  status: WorkAuthorization | null
}) {
  if (!status) return null
  const requires = !['us_citizen', 'green_card'].includes(status)
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-xs',
        requires
          ? 'border-[#FF6733]/30 bg-[#FF6733]/[0.08] text-[#FF6733]'
          : 'border-[#22c55e]/30 bg-[#22c55e]/[0.08] text-[#22c55e]',
      )}
    >
      {requires
        ? "Scout will filter out roles that don't sponsor visas"
        : "You're eligible for all roles"}
    </div>
  )
}

const COVER_LETTER_LIMIT = 300

function CoverLetterInput({
  value,
  onChange,
  onBlur,
}: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <div className="space-y-2">
      <ProfileTextarea
        value={value}
        onValueChange={(next) => {
          if (next.length <= COVER_LETTER_LIMIT) onChange(next)
          else onChange(next.slice(0, COVER_LETTER_LIMIT))
        }}
        onBlur={onBlur}
        placeholder="I am excited to apply for the {role} position at {company}. As a {year} {degree} student in {major} at {school}..."
      />
      <div className="flex justify-end text-[11px] text-[#555]">
        {value.length} / {COVER_LETTER_LIMIT}
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-10">
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      {Array.from({ length: 4 }).map((_, idx) => (
        <Skeleton key={idx} className="h-64 w-full rounded-2xl" />
      ))}
    </div>
  )
}
