'use client'

import { useUser } from '@clerk/nextjs'
import Image from 'next/image'
import {
  BookOpen,
  ChevronDown,
  FileText,
  GraduationCap,
  Heart,
  Info,
  Library,
  Mail,
  MapPin,
  MessageSquare,
  Settings2,
  Shield,
  User,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import 'react-phone-number-input/style.css'

import {
  getProfile,
  updateProfile,
  type AnswersLibrary,
  type OpenEndedPreference,
  type ProfileData,
} from '@/app/actions/profile'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import {
  computeProfileCompletion,
  type DegreeType,
  type HeardAboutUs,
  type RemotePreference,
  type WorkAuthorization,
} from '@/lib/profile-completion'
import { scoutLogo } from '@/lib/scout-logo'
import { isPaidUser, normalizeSubscriptionPlan } from '@/lib/subscription-plan'
import { cn } from '@/lib/utils'

type SectionId =
  | 'personal'
  | 'authorization'
  | 'education'
  | 'preferences'
  | 'application'
  | 'application_preferences'
  | 'answers_library'
  | 'diversity'

function emptyAnswersLibrary(): Record<keyof AnswersLibrary, string> {
  return {
    why_company: '',
    career_goals: '',
    about_yourself: '',
    why_hire_me: '',
    greatest_strength: '',
    greatest_weakness: '',
    challenge_overcome: '',
    proud_projects: '',
  }
}

const ANSWER_FIELDS = [
  {
    key: 'why_company',
    label: 'Why do you want to work here?',
    placeholder: "I'm excited about {company} because...",
  },
  {
    key: 'career_goals',
    label: 'What are your career goals?',
    placeholder: 'My goal is to...',
  },
  {
    key: 'about_yourself',
    label: 'Tell us about yourself',
    placeholder: "I'm a [year] [degree] student...",
  },
  {
    key: 'why_hire_me',
    label: 'Why should we hire you?',
    placeholder: 'I bring a unique combination...',
  },
  {
    key: 'greatest_strength',
    label: "What's your greatest strength?",
    placeholder: 'My greatest strength is...',
  },
  {
    key: 'greatest_weakness',
    label: "What's your greatest weakness?",
    placeholder: "I'm working on improving...",
  },
  {
    key: 'challenge_overcome',
    label: 'Describe a challenge you overcame',
    placeholder: 'One challenge I faced was...',
  },
  {
    key: 'proud_projects',
    label: 'What projects are you most proud of?',
    placeholder: "I'm most proud of...",
  },
] as const

type AnswerKey = (typeof ANSWER_FIELDS)[number]['key']

const PREFERENCE_OPTIONS: ReadonlyArray<{
  value: OpenEndedPreference
  label: string
  sub: string
  Icon?: LucideIcon
  useScoutLogo?: boolean
  recommended?: boolean
  requiresPhone?: boolean
}> = [
  {
    value: 'auto',
    label: 'Auto-generate',
    sub: 'Scout writes answers using your profile',
    useScoutLogo: true,
  },
  {
    value: 'library',
    label: 'Use my answers',
    sub: 'Scout uses your pre-written answers',
    Icon: BookOpen,
    recommended: true,
  },
  {
    value: 'sms',
    label: 'Ask me via SMS',
    sub: 'Scout pauses and texts you',
    Icon: MessageSquare,
    requiresPhone: true,
  },
  {
    value: 'email',
    label: 'Ask me via email',
    sub: 'Scout pauses and emails you',
    Icon: Mail,
  },
]

const ANSWER_LIMIT = 500

const EMPTY_PROFILE: ProfileData = {
  name: null,
  phone_number: null,
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  address_street: null,
  address_city: null,
  address_state: null,
  address_zip: null,
  address_country: 'United States',
  work_authorization: null,
  cpt_eligible: false,
  opt_eligible: false,
  requires_sponsorship: null,
  school: null,
  degree_type: null,
  major: null,
  minor: null,
  gpa: null,
  education_start_date: null,
  education_end_date: null,
  target_roles: [],
  preferred_locations: [],
  remote_preference: null,
  willing_to_relocate: false,
  earliest_start_date: null,
  heard_about_us: null,
  default_cover_letter: null,
  generate_cover_letters: false,
  gender_identity: null,
  race_ethnicity: null,
  veteran_status: null,
  disability_status: null,
  open_ended_preference: 'library',
  answers_library: emptyAnswersLibrary(),
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
  const [isPro, setIsPro] = useState(false)
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE)
  const baselineRef = useRef<ProfileData>(EMPTY_PROFILE)
  const [statusByField, setStatusByField] = useState<FieldStatusMap>({})
  const [errorByField, setErrorByField] = useState<FieldErrorMap>({})
  const [addressOpen, setAddressOpen] = useState(true)
  const [diversityOpen, setDiversityOpen] = useState(true)
  const [previewKey, setPreviewKey] = useState<AnswerKey | null>(null)
  const [libraryStatusByKey, setLibraryStatusByKey] = useState<
    Partial<Record<AnswerKey, FieldStatus>>
  >({})
  const savedTimeouts = useRef<Map<FieldKey, ReturnType<typeof setTimeout>>>(new Map())
  const librarySavedTimeouts = useRef<
    Map<AnswerKey, ReturnType<typeof setTimeout>>
  >(new Map())

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
        merged.answers_library = {
          ...emptyAnswersLibrary(),
          ...(row.answers_library ?? {}),
        }
        if (row.open_ended_preference === undefined || row.open_ended_preference === null) {
          merged.open_ended_preference = 'library'
        }
        const rawRow = result.profile as unknown as {
          subscription_plan?: string | null
        }
        setIsPro(isPaidUser(normalizeSubscriptionPlan(rawRow.subscription_plan)))
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
    const libraryTimeouts = librarySavedTimeouts.current
    return () => {
      timeouts.forEach((handle) => clearTimeout(handle))
      timeouts.clear()
      libraryTimeouts.forEach((handle) => clearTimeout(handle))
      libraryTimeouts.clear()
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

  const flashLibrarySaved = useCallback((key: AnswerKey) => {
    const existing = librarySavedTimeouts.current.get(key)
    if (existing) clearTimeout(existing)
    const handle = setTimeout(() => {
      setLibraryStatusByKey((prev) => {
        if (prev[key] !== 'saved') return prev
        return { ...prev, [key]: 'idle' }
      })
      librarySavedTimeouts.current.delete(key)
    }, 2000)
    librarySavedTimeouts.current.set(key, handle)
  }, [])

  const setLibraryFieldStatus = useCallback((key: AnswerKey, status: FieldStatus) => {
    setLibraryStatusByKey((prev) => ({ ...prev, [key]: status }))
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

  const persistRequiredTextField = useCallback(
    async (
      key: FieldKey,
      value: ProfileData[FieldKey],
      section: SectionId,
      label: string,
    ) => {
      const text = typeof value === 'string' ? value.trim() : ''
      if (!text) {
        setFieldStatus(key, 'error', `${label} is required`)
        return
      }
      await persistField(key, text, section, label)
    },
    [persistField, setFieldStatus],
  )

  const updateLocal = useCallback(
    <K extends FieldKey>(key: K, value: ProfileData[K]) => {
      setProfile((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const updateLibraryAnswer = useCallback((key: AnswerKey, value: string) => {
    const trimmed = value.length > ANSWER_LIMIT ? value.slice(0, ANSWER_LIMIT) : value
    setProfile((prev) => ({
      ...prev,
      answers_library: { ...prev.answers_library, [key]: trimmed },
    }))
  }, [])

  const persistLibraryAnswer = useCallback(
    async (key: AnswerKey) => {
      const value = profile.answers_library[key] ?? ''
      const previous = baselineRef.current.answers_library[key] ?? ''
      if (value === previous) return

      setLibraryFieldStatus(key, 'saving')
      const nextLibrary: AnswersLibrary = {
        ...baselineRef.current.answers_library,
        [key]: value,
      }
      const result = await updateProfile({ answers_library: nextLibrary })
      if ('error' in result) {
        setLibraryFieldStatus(key, 'error')
        return
      }
      baselineRef.current = {
        ...baselineRef.current,
        answers_library: nextLibrary,
      }
      setLibraryFieldStatus(key, 'saved')
      flashLibrarySaved(key)
      showSectionToast('answers_library', 'Answer saved')
    },
    [flashLibrarySaved, profile.answers_library, setLibraryFieldStatus, showSectionToast],
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
        trimmed(profile.linkedin_url) &&
        trimmed(profile.address_street) &&
        trimmed(profile.address_city) &&
        trimmed(profile.address_state) &&
        trimmed(profile.address_zip) &&
        trimmed(profile.address_country),
      authorization: Boolean(profile.work_authorization),
      education:
        trimmed(profile.school) &&
        Boolean(profile.degree_type) &&
        trimmed(profile.major) &&
        Boolean(profile.education_end_date),
      preferences:
        profile.preferred_locations.length > 0 &&
        Boolean(profile.remote_preference) &&
        Boolean(profile.earliest_start_date),
      application: Boolean(profile.heard_about_us),
      application_preferences: Boolean(profile.open_ended_preference ?? 'library'),
      answers_library: true,
      diversity: true,
    }
  }, [profile])

  const phoneHasValue = Boolean(profile.phone_number?.trim())
  const phoneValid =
    !phoneHasValue || isValidPhoneNumber(profile.phone_number ?? '')
  const openEndedPreference =
    (profile.open_ended_preference as OpenEndedPreference | null) ?? 'library'
  const answersLibraryEnabled = openEndedPreference === 'library'

  useEffect(() => {
    if (!answersLibraryEnabled) {
      setPreviewKey(null)
    }
  }, [answersLibraryEnabled])

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
              status={statusByField.address_street}
              errorMessage={errorByField.address_street}
              className="md:col-span-2"
            >
              <ProfileInput
                id="profile-street"
                value={profile.address_street ?? ''}
                onValueChange={(value) => updateLocal('address_street', value)}
                onBlur={() =>
                  void persistRequiredTextField(
                    'address_street',
                    profile.address_street,
                    'personal',
                    'Street address',
                  )
                }
                placeholder="1234 Main St"
                required
              />
            </FieldRow>

            <FieldRow
              htmlFor="profile-city"
              label="City"
              status={statusByField.address_city}
              errorMessage={errorByField.address_city}
            >
              <ProfileInput
                id="profile-city"
                value={profile.address_city ?? ''}
                onValueChange={(value) => updateLocal('address_city', value)}
                onBlur={() =>
                  void persistRequiredTextField('address_city', profile.address_city, 'personal', 'City')
                }
                placeholder="San Francisco"
                required
              />
            </FieldRow>

            <FieldRow
              label="State"
              status={statusByField.address_state}
              errorMessage={errorByField.address_state}
            >
              <ProfileSelect
                value={profile.address_state ?? ''}
                onValueChange={(value) => {
                  if (!value) {
                    updateLocal('address_state', null)
                    setFieldStatus('address_state', 'error', 'State is required')
                    return
                  }
                  void commitImmediate(
                    'address_state',
                    value,
                    'personal',
                    'State',
                  )
                }}
                options={STATE_OPTIONS}
                placeholder="Select…"
                required
              />
            </FieldRow>

            <FieldRow
              htmlFor="profile-zip"
              label="Zip / Postal code"
              status={statusByField.address_zip}
              errorMessage={errorByField.address_zip}
            >
              <ProfileInput
                id="profile-zip"
                value={profile.address_zip ?? ''}
                onValueChange={(value) => updateLocal('address_zip', value)}
                onBlur={() =>
                  void persistRequiredTextField(
                    'address_zip',
                    profile.address_zip,
                    'personal',
                    'Zip / Postal code',
                  )
                }
                placeholder="94110"
                required
              />
            </FieldRow>

            <FieldRow
              htmlFor="profile-country"
              label="Country"
              status={statusByField.address_country}
              errorMessage={errorByField.address_country}
            >
              <ProfileInput
                id="profile-country"
                value={profile.address_country ?? ''}
                onValueChange={(value) => updateLocal('address_country', value)}
                onBlur={() =>
                  void persistRequiredTextField(
                    'address_country',
                    profile.address_country,
                    'personal',
                    'Country',
                  )
                }
                placeholder="United States"
                required
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
            htmlFor="profile-edu-start"
            label="Started"
            status={statusByField.education_start_date}
            errorMessage={errorByField.education_start_date}
          >
            <ProfileInput
              id="profile-edu-start"
              type="month"
              value={profile.education_start_date?.slice(0, 7) ?? ''}
              onValueChange={(value) =>
                updateLocal('education_start_date', value || null)
              }
              onBlur={() =>
                void persistField(
                  'education_start_date',
                  profile.education_start_date,
                  'education',
                  'Education start',
                )
              }
            />
          </FieldRow>

          <FieldRow
            htmlFor="profile-edu-end"
            label="Expected graduation"
            status={statusByField.education_end_date}
            errorMessage={errorByField.education_end_date}
          >
            <ProfileInput
              id="profile-edu-end"
              type="month"
              value={profile.education_end_date?.slice(0, 7) ?? ''}
              onValueChange={(value) =>
                updateLocal('education_end_date', value || null)
              }
              onBlur={() =>
                void persistField(
                  'education_end_date',
                  profile.education_end_date,
                  'education',
                  'Expected graduation',
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

        <div className="border-t border-white/[0.05] pt-4">
          <Toggle
            id="generate-cover-letters"
            label="Let Scout generate cover letters"
            description={
              isPro
                ? 'Scout writes a tailored cover letter for each job and uploads it when an application has a cover-letter field.'
                : 'Pro feature — upgrade to let Scout write and attach a tailored cover letter per job.'
            }
            checked={profile.generate_cover_letters}
            disabled={!isPro}
            onChange={(value) =>
              void commitImmediate(
                'generate_cover_letters',
                value,
                'application',
                'Cover letter generation',
              )
            }
          />
        </div>
      </ProfileSection>

      <ProfileSection
        title="Application Preferences"
        icon={Settings2}
        description="How Scout handles questions it encounters on applications"
        complete={sectionComplete.application_preferences}
      >
        <div
          role="radiogroup"
          aria-label="Open-ended question preference"
          className="space-y-1.5"
        >
          {PREFERENCE_OPTIONS.map((option) => {
            const disabled = Boolean(option.requiresPhone && !phoneHasValue)
            const selected = openEndedPreference === option.value
            return (
              <PreferenceOptionCard
                key={option.value}
                option={option}
                selected={selected}
                disabled={disabled}
                onSelect={() =>
                  void commitImmediate(
                    'open_ended_preference',
                    option.value,
                    'application_preferences',
                    'Application preference',
                  )
                }
              />
            )
          })}
        </div>
      </ProfileSection>

      <ProfileSection
        title="Answers Library"
        icon={Library}
        description={
          answersLibraryEnabled
            ? 'Pre-write answers to common application questions. Scout uses these automatically when it encounters matching questions.'
            : 'Not used with your current application preference. Select "Use my answers" above to edit.'
        }
        complete={!answersLibraryEnabled || sectionComplete.answers_library}
      >
        {!answersLibraryEnabled && (
          <div className="flex gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#666]" strokeWidth={1.75} />
            <p className="text-xs text-[#666]">
              Scout will auto-generate answers, or ask you via SMS or email based on
              your Application Preferences. Switch to{' '}
              <span className="text-[#aaa]">Use my answers</span> to fill this
              library.
            </p>
          </div>
        )}

        <div
          className={cn(
            'space-y-4 transition-[opacity,filter] duration-200',
            !answersLibraryEnabled &&
              'pointer-events-none select-none opacity-40 grayscale-[0.35]',
          )}
          aria-disabled={!answersLibraryEnabled}
          inert={!answersLibraryEnabled ? true : undefined}
        >
          <div className="flex gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <Info
              className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0',
                answersLibraryEnabled ? 'text-[#FF6733]' : 'text-[#555]',
              )}
              strokeWidth={1.75}
            />
            <p className="text-xs text-[#888]">
              Use {'{company}'} as a placeholder — Scout replaces it with the real
              company name on each application.
            </p>
          </div>

          {ANSWER_FIELDS.map((field) => (
            <AnswersLibraryField
              key={field.key}
              field={field}
              value={profile.answers_library[field.key] ?? ''}
              status={libraryStatusByKey[field.key]}
              disabled={!answersLibraryEnabled}
              onChange={(value) => updateLibraryAnswer(field.key, value)}
              onBlur={() => {
                if (answersLibraryEnabled) {
                  void persistLibraryAnswer(field.key)
                }
              }}
              onPreview={() => setPreviewKey(field.key)}
            />
          ))}
        </div>
      </ProfileSection>

      <AnswerPreviewDialog
        open={previewKey !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewKey(null)
        }}
        field={ANSWER_FIELDS.find((f) => f.key === previewKey) ?? null}
        answer={
          previewKey ? (profile.answers_library[previewKey] ?? '') : ''
        }
      />

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
          ? 'border-[#FF6733]/30 bg-primary/[0.08] text-[#FF6733]'
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

function PreferenceOptionCard({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: (typeof PREFERENCE_OPTIONS)[number]
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const Icon = option.Icon

  const cardContent = (
    <>
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200',
          selected
            ? 'border-[#FF6733]/40 bg-primary/15'
            : 'border-white/10 bg-white/[0.03]',
          disabled && 'opacity-70',
        )}
      >
        {option.useScoutLogo ? (
          <Image
            src={scoutLogo}
            alt="Scout"
            width={14}
            height={14}
            className="object-contain"
          />
        ) : Icon ? (
          <Icon className="h-3.5 w-3.5 text-[#FF6733]" strokeWidth={1.75} />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-white">{option.label}</span>
          {option.recommended && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#FF6733]">
              Recommended
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-[#666]">{option.sub}</p>
      </div>
    </>
  )

  const cardClassName = cn(
    'flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200',
    selected
      ? 'border-primary/60 bg-primary/[0.06]'
      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
    disabled && 'cursor-not-allowed opacity-50',
  )

  if (disabled) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="radio"
              aria-checked={false}
              aria-disabled
              tabIndex={0}
              className={cardClassName}
            >
              {cardContent}
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={8}
            className="max-w-[260px] border border-white/10 bg-[#111] px-3 py-2 text-xs text-[#aaa]"
          >
            Add your phone number above to use this
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cardClassName}
    >
      {cardContent}
    </button>
  )
}

function AnswersLibraryField({
  field,
  value,
  status,
  disabled = false,
  onChange,
  onBlur,
  onPreview,
}: {
  field: (typeof ANSWER_FIELDS)[number]
  value: string
  status?: FieldStatus
  disabled?: boolean
  onChange: (value: string) => void
  onBlur: () => void
  onPreview: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-sm', disabled ? 'text-[#555]' : 'text-[#888]')}>
          {field.label}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPreview}
            disabled={disabled}
            className="h-7 px-2 text-xs text-[#888] hover:text-white disabled:pointer-events-none disabled:opacity-50"
          >
            Preview
          </Button>
          <SaveBadgeInline status={status ?? 'idle'} />
        </div>
      </div>
      <ProfileTextarea
        value={value}
        rows={3}
        disabled={disabled}
        readOnly={disabled}
        onValueChange={onChange}
        onBlur={onBlur}
        placeholder={field.placeholder}
        className={cn(
          'min-h-0 resize-y',
          disabled && 'cursor-not-allowed opacity-80',
        )}
      />
      <div className="flex justify-end text-xs text-[#555]">
        {value.length} / {ANSWER_LIMIT}
      </div>
    </div>
  )
}

function SaveBadgeInline({ status }: { status: FieldStatus }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[#666]">
        Saving
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[#22c55e]">
        Saved ✓
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[#ef4444]">
        Error
      </span>
    )
  }
  return null
}

function AnswerPreviewDialog({
  open,
  onOpenChange,
  field,
  answer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: (typeof ANSWER_FIELDS)[number] | null
  answer: string
}) {
  if (!field) return null

  const previewText =
    answer.trim().length > 0
      ? answer.replaceAll('{company}', 'Example Company')
      : 'No answer saved yet.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong max-w-md gap-4 rounded-2xl border-white/10 bg-[#0a0a0a]/90 p-6 text-white">
        <DialogHeader className="text-left">
          <DialogTitle className="font-headline text-base font-medium leading-snug text-white">
            Scout will use this answer when it sees a question like:{' '}
            <span className="text-[#FF6733]">{field.label}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">Answer preview</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#aaa]">
          {previewText}
        </p>
      </DialogContent>
    </Dialog>
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
