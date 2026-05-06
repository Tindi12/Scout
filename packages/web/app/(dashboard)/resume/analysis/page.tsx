'use client'

import { useUser } from '@clerk/nextjs'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Lock,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { BreakdownCard } from '@/components/resume/BreakdownCard'
import { ScoreWheel } from '@/components/resume/ScoreWheel'
import {
  WeaknessCard,
  type Weakness,
  type WeaknessSeverity,
} from '@/components/resume/WeaknessCard'

const ROLE_LABELS: Record<string, string> = {
  swe: 'Software Engineering',
  ml: 'Machine Learning',
  data_eng: 'Data Engineering',
  devops: 'DevOps',
  product: 'Product Management',
  research: 'Research',
  chem_eng: 'Chemical Engineering',
  mech_eng: 'Mechanical Engineering',
  elec_eng: 'Electrical Engineering',
  civil_eng: 'Civil Engineering',
  bio_eng: 'Biomedical Engineering',
  industrial_eng: 'Industrial Engineering',
}

const ROLE_KEY_BY_LABEL = Object.fromEntries(
  Object.entries(ROLE_LABELS).map(([key, label]) => [label.toLowerCase(), key]),
) as Record<string, string>

const LAST_ANALYSIS_ID_KEY = 'scout:last_analysis_id'

function displayRole(role: string): string {
  return role
    .replace(/\s+(Internship|Intern)\s*$/i, '')
    .trim()
}

type Breakdown = {
  experience: number
  metrics: number
  structure: number
  keywords: number
}

type Analysis = {
  id: string
  resume_id: string
  target_role: string
  score: number
  breakdown: Breakdown
  weaknesses: Weakness[]
}

type PageState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; analysis: Analysis }

const SEVERITY_ORDER: Record<WeaknessSeverity, number> = {
  critical: 0,
  warning: 1,
  suggestion: 2,
}

function clampScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(num)) return 0
  return Math.max(0, Math.min(100, num))
}

function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

function normalizeBreakdown(raw: unknown): Breakdown {
  const obj = parseMaybeJson<Partial<Breakdown>>(raw, {})
  return {
    experience: Number(obj?.experience ?? 0) || 0,
    metrics: Number(obj?.metrics ?? 0) || 0,
    structure: Number(obj?.structure ?? 0) || 0,
    keywords: Number(obj?.keywords ?? 0) || 0,
  }
}

function normalizeWeaknesses(raw: unknown): Weakness[] {
  const list = parseMaybeJson<unknown>(raw, [])
  if (!Array.isArray(list)) return []
  return list
    .map((entry): Weakness | null => {
      if (!entry || typeof entry !== 'object') return null
      const w = entry as Record<string, unknown>
      const severity = (w.severity as WeaknessSeverity) ?? 'suggestion'
      if (!['critical', 'warning', 'suggestion'].includes(severity)) {
        return null
      }
      return {
        type: typeof w.type === 'string' ? w.type : 'GENERAL',
        severity,
        message: typeof w.message === 'string' ? w.message : '',
        suggestion: typeof w.suggestion === 'string' ? w.suggestion : '',
      }
    })
    .filter((w): w is Weakness => w !== null)
}

function normalizeTargetRoleKeys(raw: unknown): string[] {
  const roleEntries: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? parseMaybeJson<unknown[]>(raw, [])
      : []

  const normalized = roleEntries
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .map((role) => {
      if (role in ROLE_LABELS) return role
      const byLabel = ROLE_KEY_BY_LABEL[role.toLowerCase()]
      return byLabel ?? ''
    })
    .filter((role): role is string => Boolean(role))

  return Array.from(new Set(normalized))
}

export default function ResumeAnalysisPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, isLoaded: userLoaded } = useUser()
  const analysisId = searchParams.get('id')

  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [isPro, setIsPro] = useState<boolean>(false)
  const [targetRoles, setTargetRoles] = useState<string[]>([])
  const [isReanalyzing, setIsReanalyzing] = useState<boolean>(false)
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null)
  const [roleMenuOpen, setRoleMenuOpen] = useState<boolean>(false)
  const roleMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!roleMenuOpen) return
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (!roleMenuRef.current || !target) return
      if (!roleMenuRef.current.contains(target)) setRoleMenuOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setRoleMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [roleMenuOpen])

  useEffect(() => {
    document.title = 'Resume Analysis — Scout'
  }, [])

  useEffect(() => {
    if (!analysisId) {
      setState({ status: 'missing' })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })

    void (async () => {
      try {
        const res = await fetch(
          `/api/resume/analysis/${encodeURIComponent(analysisId)}`,
          { method: 'GET', cache: 'no-store' },
        )
        const text = await res.text()
        let body: Record<string, unknown> | null = null
        try {
          body = text ? (JSON.parse(text) as Record<string, unknown>) : null
        } catch {
          body = null
        }

        if (cancelled) return

        if (!res.ok || !body) {
          const detail =
            typeof body?.detail === 'string'
              ? body.detail
              : 'We couldn’t load this analysis.'
          setState({ status: 'error', message: detail })
          return
        }

        const analysis: Analysis = {
          id: String(body.id ?? ''),
          resume_id: String(body.resume_id ?? ''),
          target_role:
            typeof body.target_role === 'string' && body.target_role.trim()
              ? (body.target_role as string)
              : 'Your target role',
          score: clampScore(body.score),
          breakdown: normalizeBreakdown(body.breakdown),
          weaknesses: normalizeWeaknesses(body.weaknesses),
        }

        setState({ status: 'loaded', analysis })
      try {
        if (analysis.id) window.localStorage.setItem(LAST_ANALYSIS_ID_KEY, analysis.id)
      } catch {
        // ignore
      }
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'Something went wrong loading your analysis.',
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [analysisId])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/user/me', {
          method: 'GET',
          cache: 'no-store',
        })
        if (cancelled) return
        if (!res.ok) {
          setIsPro(false)
          setTargetRoles([])
          return
        }
        const body = (await res.json()) as {
          is_pro?: boolean
          target_roles?: unknown
        }
        setIsPro(Boolean(body?.is_pro))
        setTargetRoles(normalizeTargetRoleKeys(body?.target_roles))
      } catch {
        if (!cancelled) {
          setIsPro(false)
          setTargetRoles([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const sortedWeaknesses = useMemo(() => {
    if (state.status !== 'loaded') return []
    return [...state.analysis.weaknesses].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    )
  }, [state])

  const handleSelectRole = async (roleKey: string) => {
    setRoleMenuOpen(false)
    if (state.status !== 'loaded' || isReanalyzing) return
    const label = ROLE_LABELS[roleKey]
    if (!label || label === state.analysis.target_role) return

    const resumeId = state.analysis.resume_id
    if (!resumeId) {
      setReanalyzeError('Missing resume reference for re-analysis.')
      return
    }

    setIsReanalyzing(true)
    setReanalyzeError(null)

    try {
      const res = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: resumeId, target_role: label }),
      })

      const text = await res.text()
      let body: Record<string, unknown> | null = null
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : null
      } catch {
        body = null
      }

      if (!res.ok || !body) {
        const detail =
          typeof body?.detail === 'string'
            ? body.detail
            : 'Could not re-analyze for this role.'
        setReanalyzeError(detail)
        return
      }

      const newAnalysisId = String(body.analysis_id ?? '')
      if (!newAnalysisId) {
        setReanalyzeError('Re-analysis returned an unexpected response.')
        return
      }

      setState({
        status: 'loaded',
        analysis: {
          id: newAnalysisId,
          resume_id: resumeId,
          target_role: label,
          score: clampScore(body.score),
          breakdown: normalizeBreakdown(body.breakdown),
          weaknesses: normalizeWeaknesses(body.weaknesses),
        },
      })
      try {
        window.localStorage.setItem(LAST_ANALYSIS_ID_KEY, newAnalysisId)
      } catch {
        // ignore
      }

      router.replace(`/resume/analysis?id=${newAnalysisId}`, { scroll: false })
    } catch {
      setReanalyzeError('Something went wrong re-analyzing. Please try again.')
    } finally {
      setIsReanalyzing(false)
    }
  }

  if (state.status === 'loading' || !userLoaded) {
    return <AnalysisSkeleton />
  }

  if (state.status === 'missing' || state.status === 'error') {
    const message =
      state.status === 'missing'
        ? 'No analysis selected. Head back to your dashboard to start one.'
        : state.message
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 py-20 text-center">
        <div className="glass-card rounded-2xl border border-white/[0.06] p-8">
          <p className="font-headline text-xl font-medium text-white">
            We couldn’t open that analysis
          </p>
          <p className="mt-2 font-body text-sm text-[#999]">{message}</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_32px_rgba(255,103,51,0.55)]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const { analysis } = state

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="mx-auto w-full max-w-6xl"
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:gap-10">
        <aside className="flex flex-col gap-6 md:sticky md:top-6 md:self-start">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 font-body text-sm text-[#888] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Dashboard
          </Link>

          <div className="flex flex-col items-center gap-5">
            <div className="relative hidden md:block">
              <ScoreWheel score={analysis.score} size={240} />
              {isReanalyzing ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                  <Loader2
                    className="h-6 w-6 animate-spin text-[#FF6733]"
                    strokeWidth={2}
                  />
                </div>
              ) : null}
            </div>
            <div className="relative md:hidden">
              <ScoreWheel score={analysis.score} size={180} />
              {isReanalyzing ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                  <Loader2
                    className="h-6 w-6 animate-spin text-[#FF6733]"
                    strokeWidth={2}
                  />
                </div>
              ) : null}
            </div>

            {targetRoles.length <= 1 ? (
              <span className="glass-pill inline-flex items-center rounded-full px-4 py-1.5 font-body text-sm text-[#FF6733]">
                Analyzed for: {displayRole(analysis.target_role)}
              </span>
            ) : (
              <div className="flex w-full flex-col items-center gap-2">
                <div
                  ref={roleMenuRef}
                  className="relative w-full max-w-[320px]"
                >
                  <button
                    type="button"
                    onClick={() => setRoleMenuOpen((v) => !v)}
                    disabled={isReanalyzing}
                    aria-haspopup="listbox"
                    aria-expanded={roleMenuOpen}
                    className="glass-pill inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 px-4 py-1.5 font-body text-sm text-[#FF6733] transition-colors hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="truncate">
                      Analyzed for: {displayRole(analysis.target_role)}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-[#FF6733] transition-transform duration-200 ${
                        roleMenuOpen ? 'rotate-180' : ''
                      }`}
                      strokeWidth={2}
                    />
                  </button>

                  <AnimatePresence>
                    {roleMenuOpen ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        role="listbox"
                        className="glass-card absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/[0.08] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                      >
                        {targetRoles.map((roleKey) => {
                          const label = ROLE_LABELS[roleKey]
                          const isActive =
                            displayRole(label).toLowerCase() ===
                            displayRole(analysis.target_role).toLowerCase()
                          return (
                            <button
                              key={roleKey}
                              type="button"
                              role="option"
                              aria-selected={isActive}
                              onClick={() => void handleSelectRole(roleKey)}
                              disabled={isReanalyzing || isActive}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 font-body text-sm transition-colors ${
                                isActive
                                  ? 'cursor-default bg-[#FF6733]/15 text-[#FF6733]'
                                  : 'text-[#bdbdbd] hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50'
                              }`}
                            >
                              <span className="truncate text-left">
                                {label}
                              </span>
                              {isActive ? (
                                <Check
                                  className="h-4 w-4 shrink-0 text-[#FF6733]"
                                  strokeWidth={2.25}
                                />
                              ) : null}
                            </button>
                          )
                        })}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                {reanalyzeError ? (
                  <p
                    role="alert"
                    className="font-body text-xs text-[#ef4444]"
                  >
                    {reanalyzeError}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <BreakdownCard breakdown={analysis.breakdown} />
        </aside>

        <section className="flex flex-col gap-5">
          <header className="flex flex-col gap-1.5">
            <p className="font-label text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF6733]">
              What Scout Found
            </p>
            <p className="font-body text-sm text-[#888]">
              {sortedWeaknesses.length === 0
                ? 'No critical issues found.'
                : `${sortedWeaknesses.length} ${
                    sortedWeaknesses.length === 1 ? 'issue' : 'issues'
                  } detected`}
            </p>
          </header>

          {sortedWeaknesses.length === 0 ? (
            <div className="glass-card flex items-center gap-4 rounded-2xl border border-white/[0.06] p-6 md:p-7">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#22c55e]/15 ring-1 ring-[#22c55e]/30">
                <CheckCircle2
                  className="h-6 w-6 text-[#22c55e]"
                  strokeWidth={1.75}
                />
              </div>
              <div>
                <p className="font-headline text-lg font-medium text-white">
                  Your resume looks strong.
                </p>
                <p className="mt-1 font-body text-sm text-[#999]">
                  No critical issues found.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sortedWeaknesses.map((weakness, index) => (
                <motion.div
                  key={`${weakness.type}-${index}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    ease: 'easeOut',
                    delay: index * 0.08,
                  }}
                >
                  <WeaknessCard weakness={weakness} />
                </motion.div>
              ))}
            </div>
          )}

          <RewriteCta isPro={isPro} />
        </section>
      </div>
    </motion.div>
  )
}

function RewriteCta({ isPro }: { isPro: boolean }) {
  return (
    <div className="glass-card mt-2 flex flex-col items-center gap-4 rounded-2xl border border-white/[0.06] p-7 text-center md:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md">
        <Image
          src="/scout-logo.png"
          alt="Scout"
          width={28}
          height={28}
          draggable={false}
          className="h-7 w-7 select-none object-contain"
        />
      </div>
      <div>
        <p className="font-headline text-xl font-medium tracking-[-0.01em] text-white">
          Ready to optimize?
        </p>
        <p className="mx-auto mt-2 max-w-md font-body text-sm leading-relaxed text-[#999]">
          Scout will rewrite your resume using the Jake-ATS proof format, fixing every issue
          above.
        </p>
      </div>

      {isPro ? (
        <Link
          href="/resume/builder"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-6 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_32px_rgba(255,103,51,0.55)] active:scale-[0.97]"
        >
          Rewrite with Scout
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span
            aria-disabled
            className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-6 font-label text-sm font-semibold text-[#888]"
          >
            <Lock className="h-4 w-4" strokeWidth={2} />
            Rewrite with Scout
          </span>
          <p className="font-body text-xs text-[#666]">
            Pro feature — Upgrade to unlock
          </p>
        </div>
      )}
    </div>
  )
}

function AnalysisSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:gap-10">
        <aside className="flex flex-col gap-6">
          <div className="h-4 w-24 animate-pulse rounded-full bg-white/5" />
          <div className="flex flex-col items-center gap-5">
            <div className="h-[240px] w-[240px] animate-pulse rounded-full bg-white/5" />
            <div className="h-7 w-44 animate-pulse rounded-full bg-white/5" />
          </div>
          <div className="glass-card rounded-2xl border border-white/[0.06] p-6 md:p-7">
            <div className="h-3 w-32 animate-pulse rounded-full bg-white/5" />
            <div className="mt-5 flex flex-col gap-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
                    <div className="h-4 w-12 animate-pulse rounded bg-white/5" />
                  </div>
                  <div className="h-2 w-full animate-pulse rounded-full bg-white/5" />
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-36 animate-pulse rounded-full bg-white/5" />
            <div className="h-4 w-44 animate-pulse rounded-full bg-white/5" />
          </div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="glass-card h-32 animate-pulse rounded-2xl border border-white/[0.06]"
            />
          ))}
        </section>
      </div>
    </div>
  )
}
