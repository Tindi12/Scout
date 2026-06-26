'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Atom,
  BarChart3,
  Brain,
  Building2,
  Check,
  Code2,
  Cog,
  FlaskConical,
  HeartPulse,
  Leaf,
  Loader2,
  Microscope,
  Plane,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useUser } from '@clerk/nextjs'

import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
import { scoutLogo } from '@/lib/scout-logo'
import {
  completeOnboarding,
  type OnboardingData,
  type TargetRole,
} from '@/app/actions/onboarding'

type Role = {
  id: TargetRole
  title: string
  desc: string
  Icon: LucideIcon
}

const ROLES: Role[] = [
  {
    id: 'swe',
    title: 'Software Engineering',
    desc: 'SWE internships at startups to FAANG',
    Icon: Code2,
  },
  {
    id: 'ml',
    title: 'Machine Learning',
    desc: 'ML, AI, and data science roles',
    Icon: Brain,
  },
  {
    id: 'environmental_eng',
    title: 'Environmental Engineering',
    desc: 'Sustainability, water systems, and climate-tech internships',
    Icon: Leaf,
  },
  {
    id: 'aerospace_eng',
    title: 'Aerospace Engineering',
    desc: 'Aircraft, spacecraft, and propulsion systems internships',
    Icon: Plane,
  },
  {
    id: 'nuclear_eng',
    title: 'Nuclear Engineering',
    desc: 'Reactor design, energy systems, and radiation science internships',
    Icon: Atom,
  },
  {
    id: 'research',
    title: 'Research',
    desc: 'Academic and industry research roles',
    Icon: Microscope,
  },
  {
    id: 'chem_eng',
    title: 'Chemical Engineering',
    desc: 'Process, materials, and energy internships',
    Icon: FlaskConical,
  },
  {
    id: 'mech_eng',
    title: 'Mechanical Engineering',
    desc: 'Design, manufacturing, and systems roles',
    Icon: Cog,
  },
  {
    id: 'elec_eng',
    title: 'Electrical Engineering',
    desc: 'Hardware, embedded systems, and circuits',
    Icon: Zap,
  },
  {
    id: 'civil_eng',
    title: 'Civil Engineering',
    desc: 'Infrastructure, construction, and environmental',
    Icon: Building2,
  },
  {
    id: 'bio_eng',
    title: 'Biomedical Engineering',
    desc: 'Medical devices, biotech, and health tech',
    Icon: HeartPulse,
  },
  {
    id: 'industrial_eng',
    title: 'Industrial Engineering',
    desc: 'Operations, supply chain, and systems optimization',
    Icon: BarChart3,
  },
]

type Step = 1 | 2 | 'success'

type FormState = {
  name: string
  school: string
  education_end_date: string
  gpa: string
  target_roles: TargetRole[]
}

type University = {
  name: string
  country: string
  domains: string[]
  web_pages: string[]
}

const INITIAL_FORM: FormState = {
  name: '',
  school: '',
  education_end_date: '',
  gpa: '',
  target_roles: [],
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user, isLoaded } = useUser()
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!isLoaded || !user) return
    setForm((prev) => {
      if (prev.name.trim().length > 0) return prev
      const fullName =
        user.fullName?.trim() ||
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
      if (!fullName) return prev
      return { ...prev, name: fullName }
    })
  }, [isLoaded, user])

  const step1Valid =
    form.name.trim().length > 0 &&
    form.school.trim().length > 0 &&
    form.education_end_date.trim().length > 0
  const step2Valid = form.target_roles.length > 0

  const toggleRole = (id: TargetRole) => {
    setForm((prev) => {
      const has = prev.target_roles.includes(id)
      return {
        ...prev,
        target_roles: has
          ? prev.target_roles.filter((r) => r !== id)
          : [...prev.target_roles, id],
      }
    })
  }

  const handleSubmit = async () => {
    if (!step2Valid || submitting) return
    setSubmitting(true)
    const gpaNum = form.gpa.trim() === '' ? undefined : Number(form.gpa)
    const data: OnboardingData = {
      name: form.name.trim(),
      school: form.school.trim(),
      education_end_date: form.education_end_date,
      gpa:
        typeof gpaNum === 'number' && Number.isFinite(gpaNum) ? gpaNum : undefined,
      target_roles: form.target_roles,
    }

    try {
      await completeOnboarding(data)
      track(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
        target_role_count: form.target_roles.length,
      })
      setStep('success')
      window.setTimeout(() => {
        startTransition(() => router.push('/dashboard'))
      }, 1500)
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-black px-4 py-12 text-white sm:py-16">
      <BackgroundFx />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center">
        <div className="flex items-center gap-2.5">
          <Image
            src={scoutLogo}
            alt="Scout"
            width={36}
            height={36}
            priority
            draggable={false}
            className="h-9 w-9 select-none object-contain"
          />
          <span className="font-headline text-xl font-semibold tracking-tight text-white">
            Scout
          </span>
        </div>

        <ProgressBar step={step} />

        <div className="mt-10 w-full">
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="mx-auto w-full max-w-xl"
              >
                <StepOne
                  form={form}
                  setForm={setForm}
                  canContinue={step1Valid}
                  onContinue={() => setStep(2)}
                />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="mx-auto w-full max-w-4xl"
              >
                <StepTwo
                  form={form}
                  toggleRole={toggleRole}
                  canSubmit={step2Valid}
                  submitting={submitting}
                  onBack={() => setStep(1)}
                  onSubmit={handleSubmit}
                />
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="mx-auto mt-12 flex w-full max-w-md flex-col items-center text-center"
              >
                <SuccessView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  )
}

function BackgroundFx() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[700px] w-[900px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle at center, rgba(255,103,51,0.10) 0%, rgba(255,103,51,0.04) 35%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-40 -z-10 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #1a1a1a 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-80 -z-10 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #1a1a1a 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage:
            'radial-gradient(ellipse at top, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at top, black 30%, transparent 75%)',
        }}
      />
    </>
  )
}

function ProgressBar({ step }: { step: Step }) {
  const activeIndex = step === 1 ? 0 : 1
  return (
    <div className="mt-8 flex items-center gap-2" aria-label="Onboarding progress">
      {[0, 1].map((i) => {
        const isActive = i <= activeIndex
        return (
          <span
            key={i}
            className={`h-1 w-12 rounded-full transition-all duration-300 ${
              isActive
                ? 'bg-[#FF6733] shadow-[0_0_12px_rgba(255,103,51,0.5)]'
                : 'bg-white/10'
            }`}
          />
        )
      })}
    </div>
  )
}

type FieldLabelProps = {
  htmlFor: string
  required?: boolean
  optional?: boolean
  children: React.ReactNode
}

function FieldLabel({ htmlFor, required, optional, children }: FieldLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`font-label flex items-center gap-2 text-[13px] font-medium ${
        optional ? 'text-[#666]' : 'text-white/85'
      }`}
    >
      <span>{children}</span>
      {required && (
        <span className="font-label text-[10px] uppercase tracking-[0.18em] text-[#FF6733]/80">
          Required
        </span>
      )}
      {optional && (
        <span className="font-label text-[10px] uppercase tracking-[0.18em] text-[#555]">
          Optional
        </span>
      )}
    </label>
  )
}

function TextField({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  step,
  min,
  max,
  ghost,
  autoComplete,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel'
  step?: string
  min?: string
  max?: string
  ghost?: boolean
  autoComplete?: string
}) {
  return (
    <input
      id={id}
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      autoComplete={autoComplete}
      className={`font-body mt-2 w-full rounded-xl bg-white/[0.03] px-4 py-3.5 text-[15px] text-white placeholder:text-[#555] backdrop-blur-md transition-all duration-200 focus:bg-white/[0.05] focus:shadow-[0_0_24px_rgba(255,103,51,0.18)] focus:outline-none ${
        ghost
          ? 'border border-white/[0.05] focus:border-[#FF6733]/40'
          : 'border border-white/10 focus:border-[#FF6733]/60'
      }`}
    />
  )
}

function StepOne({
  form,
  setForm,
  canContinue,
  onContinue,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  canContinue: boolean
  onContinue: () => void
}) {
  const universitiesRef = useRef<University[]>([])
  const [schoolResults, setSchoolResults] = useState<University[]>([])
  const [totalSchoolMatches, setTotalSchoolMatches] = useState(0)
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const schoolFieldRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/universities.json')
      .then((r) => {
        if (r.ok) return r.json() as Promise<University[]>
        return fetch('/world_universities_and_domains.json').then((fallback) =>
          fallback.ok ? (fallback.json() as Promise<University[]>) : [],
        )
      })
      .then((data) => {
        universitiesRef.current = Array.isArray(data) ? data : []
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!schoolFieldRef.current) return
      if (!schoolFieldRef.current.contains(event.target as Node)) {
        setShowSchoolDropdown(false)
      }
    }

    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    const query = form.school.trim().toLowerCase()
    if (query.length <= 2) {
      setSchoolResults([])
      setTotalSchoolMatches(0)
      setShowSchoolDropdown(false)
      setHighlightedIndex(-1)
      return
    }

    const matches = universitiesRef.current
      .filter((u) => u.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aUS = a.country === 'United States' ? 0 : 1
        const bUS = b.country === 'United States' ? 0 : 1
        return aUS - bUS || a.name.localeCompare(b.name)
      })
    const topResults = matches.slice(0, 20)

    setTotalSchoolMatches(matches.length)
    setSchoolResults(topResults)
    setShowSchoolDropdown(topResults.length > 0)
    setHighlightedIndex(topResults.length > 0 ? 0 : -1)
  }, [form.school])

  const selectSchool = (schoolName: string) => {
    setForm((p) => ({ ...p, school: schoolName }))
    setShowSchoolDropdown(false)
    setHighlightedIndex(-1)
  }

  const handleSchoolKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSchoolDropdown || schoolResults.length === 0) {
      if (event.key === 'Escape') {
        setShowSchoolDropdown(false)
        setHighlightedIndex(-1)
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((prev) =>
        prev < schoolResults.length - 1 ? prev + 1 : 0,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : schoolResults.length - 1,
      )
      return
    }

    if (event.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < schoolResults.length) {
        event.preventDefault()
        selectSchool(schoolResults[highlightedIndex].name)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setShowSchoolDropdown(false)
      setHighlightedIndex(-1)
    }
  }

  return (
    <div className="glass-card rounded-2xl p-7 md:p-10">
      <div className="text-center">
        <h1 className="font-headline text-3xl font-medium tracking-[-0.03em] text-white md:text-4xl">
          Let&apos;s set up your Scout
        </h1>
        <p className="mt-3 font-body text-[15px] text-[#A1A1AA]">
          Takes less than a minute.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <FieldLabel htmlFor="name" required>
            Your name
          </FieldLabel>
          <TextField
            id="name"
            value={form.name}
            onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            placeholder="Alex Johnson"
            autoComplete="name"
          />
        </div>

        <div ref={schoolFieldRef} className="relative">
          <FieldLabel htmlFor="school" required>
            Your university
          </FieldLabel>
          <input
            id="school"
            type="text"
            value={form.school}
            onChange={(event) =>
              setForm((p) => ({ ...p, school: event.target.value }))
            }
            onFocus={() => {
              if (form.school.trim().length > 2 && schoolResults.length > 0) {
                setShowSchoolDropdown(true)
                setHighlightedIndex(0)
              }
            }}
            onKeyDown={handleSchoolKeyDown}
            placeholder="University of Alabama"
            autoComplete="organization"
            className="font-body mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-[15px] text-white placeholder:text-[#555] backdrop-blur-md transition-all duration-200 focus:border-[#FF6733]/60 focus:bg-white/[0.05] focus:shadow-[0_0_24px_rgba(255,103,51,0.18)] focus:outline-none"
          />
          {showSchoolDropdown && (
            <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
              {totalSchoolMatches > 20 && (
                <div className="border-b border-white/10 px-4 py-2 text-xs text-[#555]">
                  Showing 20 of {totalSchoolMatches} matches — type more to
                  narrow down
                </div>
              )}
              <div
                className="uni-dropdown max-h-48 overflow-y-auto"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
              >
                {schoolResults.map((result, index) => (
                  <button
                    key={`${result.name}-${result.country}`}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectSchool(result.name)}
                    className={`w-full cursor-pointer px-4 py-2 text-left ${
                      highlightedIndex === index
                        ? 'bg-white/10'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="text-sm text-white">{result.name}</div>
                    <div className="text-xs text-[#888]">{result.country}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="font-label mt-2 text-xs text-[#888]">
            We&apos;ll find internships that recruit from your school
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="grad-date" required>
            Expected graduation
          </FieldLabel>
          <input
            id="grad-date"
            type="month"
            value={form.education_end_date}
            onChange={(e) =>
              setForm((p) => ({ ...p, education_end_date: e.target.value }))
            }
            className="font-label mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white transition-colors duration-200 [color-scheme:dark] focus:border-[#FF6733]/50 focus:outline-none focus:ring-1 focus:ring-[#FF6733]/30"
          />
        </div>

        <div>
          <FieldLabel htmlFor="gpa" optional>
            GPA
          </FieldLabel>
          <TextField
            id="gpa"
            value={form.gpa}
            onChange={(v) => setForm((p) => ({ ...p, gpa: v }))}
            placeholder="3.8"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="4"
            ghost
          />
          <p className="font-label mt-2 text-xs text-[#666]">
            Optional — helps with filtering
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className={`font-label mt-9 inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
          canContinue
            ? 'bg-[#FF6733] text-white shadow-[0_0_40px_rgba(255,103,51,0.35)] hover:shadow-[0_0_56px_rgba(255,103,51,0.55)]'
            : 'cursor-not-allowed bg-white/[0.04] text-[#555]'
        }`}
      >
        Continue
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function StepTwo({
  form,
  toggleRole,
  canSubmit,
  submitting,
  onBack,
  onSubmit,
}: {
  form: FormState
  toggleRole: (id: TargetRole) => void
  canSubmit: boolean
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <div className="glass-card rounded-2xl p-7 md:p-10">
      <div className="text-center">
        <h1 className="font-headline text-3xl font-medium tracking-[-0.03em] text-white md:text-4xl">
          What roles are you targeting?
        </h1>
        <p className="mx-auto mt-3 max-w-xl font-body text-[15px] text-[#A1A1AA]">
          Select all that apply. Scout will tailor everything to these roles.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {ROLES.map((role) => {
          const selected = form.target_roles.includes(role.id)
          const Icon = role.Icon
          return (
            <button
              key={role.id}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => toggleRole(role.id)}
              className={`group relative flex flex-col rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.99] ${
                selected
                  ? 'border border-[#FF6733]/60 bg-[#FF6733]/[0.06] shadow-[0_0_28px_rgba(255,103,51,0.18)]'
                  : 'glass-card border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] hover:shadow-[0_0_20px_rgba(255,103,51,0.06)]'
              }`}
            >
              {selected && (
                <span className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#FF6733] text-white shadow-[0_0_12px_rgba(255,103,51,0.6)]">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              )}
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors duration-200 ${
                  selected
                    ? 'border-[#FF6733]/40 bg-[#FF6733]/15'
                    : 'border-white/10 bg-white/[0.03] group-hover:border-[#FF6733]/30'
                }`}
              >
                <Icon
                  className="h-5 w-5 text-[#FF6733]"
                  strokeWidth={1.75}
                />
              </span>
              <h3 className="mt-4 font-headline text-[16px] font-medium leading-snug tracking-tight text-white">
                {role.title}
              </h3>
              <p className="mt-2 font-body text-[13px] leading-relaxed text-[#888]">
                {role.desc}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mt-8 flex flex-col-reverse items-stretch gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="font-label inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-sm font-medium text-white/80 transition-all duration-200 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className={`font-label inline-flex flex-1 items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
            canSubmit && !submitting
              ? 'bg-[#FF6733] text-white shadow-[0_0_40px_rgba(255,103,51,0.35)] hover:shadow-[0_0_56px_rgba(255,103,51,0.55)]'
              : 'cursor-not-allowed bg-white/[0.04] text-[#555]'
          }`}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending Scout...
            </>
          ) : (
            <>
              Send Scout
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function SuccessView() {
  return (
    <>
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 animate-pulse rounded-full bg-[#FF6733]/30 blur-2xl"
        />
        <Image
          src={scoutLogo}
          alt="Scout"
          width={80}
          height={80}
          priority
          draggable={false}
          className="h-20 w-20 select-none object-contain"
        />
      </div>
      <h2 className="mt-7 font-headline text-3xl font-medium tracking-[-0.03em] text-white md:text-4xl">
        Scout is ready.
      </h2>
      <p className="mt-3 font-body text-[15px] text-[#888]">
        Setting up your dashboard...
      </p>
    </>
  )
}
