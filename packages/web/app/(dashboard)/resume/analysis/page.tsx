'use client'

import { useUser } from '@clerk/nextjs'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ProUpgradeDialog } from '@/components/ProUpgradeDialog'
import { Button } from '@/components/ui/button'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
import { isPaidUser, normalizeSubscriptionPlan } from '@/lib/subscription-plan'
import type {
  BeforeAfterDiff,
  RewrittenResume,
} from '@/components/resume/RewriteResults'
import { BalanceRadar } from '@/components/resume/refactor/BalanceRadar'
import { ChangeList } from '@/components/resume/refactor/ChangeList'
import { RefactorProvider } from '@/components/resume/refactor/RefactorContext'
import { RefactorPreview } from '@/components/resume/refactor/RefactorPreview'
import { ResumeScanner } from '@/components/resume/refactor/ResumeScanner'
import {
  ScoreGauge,
  scoreColor,
  scoreLabel,
} from '@/components/resume/refactor/ScoreGauge'
import { ScoutLogo } from '@/components/resume/refactor/ScoutLogo'
import { SuggestionCard } from '@/components/resume/refactor/SuggestionCard'
import type {
  RefactorMode,
  ResumeSuggestion,
  ScoreBreakdown,
  SuggestionSeverity,
  SuggestionStatus,
} from '@/components/resume/refactor/types'

const ROLE_LABELS: Record<string, string> = {
  swe: 'Software Engineering',
  ml: 'Machine Learning',
  environmental_eng: 'Environmental Engineering',
  aerospace_eng: 'Aerospace Engineering',
  nuclear_eng: 'Nuclear Engineering',
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

/** Keep the scanner visible long enough for its steps to read. */
const MIN_SCAN_MS = 3200

const SPRING = { type: 'spring', stiffness: 120, damping: 20 } as const

function displayRole(role: string): string {
  return role.replace(/\s+(Internship|Intern)\s*$/i, '').trim()
}

type Analysis = {
  id: string
  resume_id: string
  target_role: string
  score: number
  breakdown: ScoreBreakdown
  suggestions: ResumeSuggestion[]
}

type RewriteData = {
  rewrittenResume: RewrittenResume
  beforeAfter: BeforeAfterDiff[]
  analysisId: string
}

type PageState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; analysis: Analysis }

const SEVERITY_ORDER: Record<SuggestionSeverity, number> = {
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

function normalizeBreakdown(raw: unknown): ScoreBreakdown {
  const obj = parseMaybeJson<Partial<ScoreBreakdown>>(raw, {})
  return {
    experience: Number(obj?.experience ?? 0) || 0,
    metrics: Number(obj?.metrics ?? 0) || 0,
    structure: Number(obj?.structure ?? 0) || 0,
    keywords: Number(obj?.keywords ?? 0) || 0,
  }
}

function normalizeSuggestions(raw: unknown): ResumeSuggestion[] {
  const list = parseMaybeJson<unknown>(raw, [])
  if (!Array.isArray(list)) return []
  return list
    .map((entry, index): ResumeSuggestion | null => {
      if (!entry || typeof entry !== 'object') return null
      const w = entry as Record<string, unknown>
      const severity = (w.severity as SuggestionSeverity) ?? 'suggestion'
      if (!['critical', 'warning', 'suggestion'].includes(severity)) {
        return null
      }
      return {
        id: `suggestion-${index}`,
        type: typeof w.type === 'string' ? w.type : 'GENERAL',
        severity,
        message: typeof w.message === 'string' ? w.message : '',
        suggestion: typeof w.suggestion === 'string' ? w.suggestion : '',
        status: 'pending',
      }
    })
    .filter((w): w is ResumeSuggestion => w !== null)
}

function normalizeBeforeAfter(raw: unknown): BeforeAfterDiff[] {
  const list = parseMaybeJson<unknown>(raw, [])
  if (!Array.isArray(list)) return []
  return list
    .map((entry): BeforeAfterDiff | null => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const section = e.section === 'projects' ? 'projects' : 'experience'
      const original = typeof e.original === 'string' ? e.original : ''
      const rewritten = typeof e.rewritten === 'string' ? e.rewritten : ''
      if (!original && !rewritten) return null
      const diff: BeforeAfterDiff = { section, original, rewritten }
      if (typeof e.company === 'string') diff.company = e.company
      if (typeof e.name === 'string') diff.name = e.name
      return diff
    })
    .filter((d): d is BeforeAfterDiff => d !== null)
}

function normalizeRewrittenResume(raw: unknown): RewrittenResume | null {
  const obj = parseMaybeJson<Record<string, unknown> | null>(raw, null)
  if (!obj || typeof obj !== 'object') return null
  if (!('experience' in obj) && !('projects' in obj) && !('education' in obj)) {
    return null
  }
  return obj as unknown as RewrittenResume
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

  const [mode, setMode] = useState<RefactorMode>('analysis')
  const [rewriteData, setRewriteData] = useState<RewriteData | null>(null)
  const [rewriteError, setRewriteError] = useState<string | null>(null)
  const [suggestionStatuses, setSuggestionStatuses] = useState<
    Record<string, SuggestionStatus>
  >({})
  const [upgradeOpen, setUpgradeOpen] = useState(false)

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
          if (res.status === 403 || res.status === 404) {
            try {
              window.localStorage.removeItem(LAST_ANALYSIS_ID_KEY)
            } catch {
              // ignore
            }
            try {
              const listRes = await fetch('/api/resume/analyses?limit=1', {
                method: 'GET',
                cache: 'no-store',
              })
              if (!cancelled && listRes.ok) {
                const listBody = (await listRes.json()) as {
                  analyses?: Array<{ id: string }>
                }
                const latestId = listBody.analyses?.[0]?.id?.trim()
                if (latestId && latestId !== analysisId) {
                  try {
                    window.localStorage.setItem(LAST_ANALYSIS_ID_KEY, latestId)
                  } catch {
                    // ignore
                  }
                  router.replace(
                    `/resume/analysis?id=${encodeURIComponent(latestId)}`,
                    { scroll: false },
                  )
                  return
                }
              }
            } catch {
              // fall through to error UI
            }
          }

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
          suggestions: normalizeSuggestions(body.weaknesses),
        }

        setState({ status: 'loaded', analysis })
        setSuggestionStatuses({})

        const rewrittenResume = normalizeRewrittenResume(body.rewritten_resume)
        if (rewrittenResume) {
          setRewriteData({
            rewrittenResume,
            beforeAfter: normalizeBeforeAfter(body.before_after),
            analysisId: analysis.id,
          })
          setMode('refactor')
        } else {
          setRewriteData(null)
          setMode('analysis')
        }
        try {
          if (analysis.id) {
            window.localStorage.setItem(LAST_ANALYSIS_ID_KEY, analysis.id)
          }
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
  }, [analysisId, router])

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
          subscription_plan?: string | null
          target_roles?: unknown
        }
        setIsPro(isPaidUser(normalizeSubscriptionPlan(body?.subscription_plan)))
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

  const suggestions = useMemo(() => {
    if (state.status !== 'loaded') return []
    return [...state.analysis.suggestions]
      .map((s) => ({ ...s, status: suggestionStatuses[s.id] ?? s.status }))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  }, [state, suggestionStatuses])

  const handleToggleDismiss = (id: string) => {
    setSuggestionStatuses((prev) => ({
      ...prev,
      [id]: prev[id] === 'ignored' ? 'pending' : 'ignored',
    }))
  }

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
          suggestions: normalizeSuggestions(body.weaknesses),
        },
      })
      setSuggestionStatuses({})
      setRewriteData(null)
      setRewriteError(null)
      setMode('analysis')
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

  const userName = useMemo(() => {
    if (!user) return 'Scout User'
    if (user.fullName && user.fullName.trim()) return user.fullName
    const parts = [user.firstName, user.lastName].filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0,
    )
    return parts.length > 0 ? parts.join(' ') : 'Scout User'
  }, [user])

  const runRewrite = async (force: boolean) => {
    if (state.status !== 'loaded' || mode === 'scanning') return
    if (!isPro) {
      setUpgradeOpen(true)
      return
    }
    if (rewriteData && !force) {
      setMode('refactor')
      return
    }
    const resumeId = state.analysis.resume_id
    if (!resumeId) {
      setRewriteError('Missing resume reference for rewrite.')
      return
    }

    setRewriteError(null)
    setMode('scanning')
    const scanStarted = Date.now()

    const finishScan = async () => {
      const remaining = MIN_SCAN_MS - (Date.now() - scanStarted)
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
    }

    try {
      const res = await fetch('/api/resume/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: resumeId,
          target_role: state.analysis.target_role,
          analysis_id: state.analysis.id,
        }),
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
            : 'Scout could not rewrite this resume. Please try again.'
        await finishScan()
        setRewriteError(detail)
        setMode('analysis')
        return
      }

      const rewrittenResume = normalizeRewrittenResume(body.rewritten)
      const beforeAfter = normalizeBeforeAfter(body.before_after)
      const newAnalysisId = String(body.analysis_id ?? state.analysis.id)

      if (!rewrittenResume) {
        await finishScan()
        setRewriteError('Rewrite returned an unexpected response.')
        setMode('analysis')
        return
      }

      track(ANALYTICS_EVENTS.RESUME_REWRITE_USED, {
        target_role: state.analysis.target_role ?? null,
      })

      await finishScan()

      // The refactor was re-scored server-side — sync the new Scout Score,
      // balance radar, and remaining issues everywhere on this page.
      setState({
        status: 'loaded',
        analysis: {
          ...state.analysis,
          id: newAnalysisId,
          score:
            body.score != null ? clampScore(body.score) : state.analysis.score,
          breakdown:
            body.breakdown != null
              ? normalizeBreakdown(body.breakdown)
              : state.analysis.breakdown,
          suggestions:
            body.weaknesses != null
              ? normalizeSuggestions(body.weaknesses)
              : state.analysis.suggestions,
        },
      })
      setSuggestionStatuses({})

      setRewriteData({
        rewrittenResume,
        beforeAfter,
        analysisId: newAnalysisId,
      })
      setMode('refactor')
    } catch {
      await finishScan()
      setRewriteError('Network error. Please try again.')
      setMode('analysis')
    }
  }

  const handleRewrite = () => {
    void runRewrite(false)
  }

  /** Runs another pass even when a rewrite exists — Scout builds on the
   * promoted refactored resume, so each pass pushes the score higher. */
  const handleRewriteAgain = () => {
    void runRewrite(true)
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
          <Button
            type="button"
            className="mt-6"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  const { analysis } = state
  const openIssues = suggestions.filter((s) => s.status !== 'ignored')

  const roleSelector =
    targetRoles.length <= 1 ? (
      <span className="glass-pill inline-flex items-center rounded-full px-4 py-1.5 font-body text-sm text-[#FF6733]">
        Analyzed for: {displayRole(analysis.target_role)}
      </span>
    ) : (
      <div className="flex flex-col items-end gap-2">
        <div ref={roleMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setRoleMenuOpen((v) => !v)}
            disabled={isReanalyzing}
            aria-haspopup="listbox"
            aria-expanded={roleMenuOpen}
            className="glass-pill inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 px-4 py-1.5 font-body text-sm text-[#FF6733] transition-colors duration-150 hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReanalyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : null}
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
                className="glass-card absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-white/[0.08] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
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
                      <span className="truncate text-left">{label}</span>
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
          <p role="alert" className="font-body text-xs text-red-400">
            {reanalyzeError}
          </p>
        ) : null}
      </div>
    )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-7xl"
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        {mode === 'refactor' ? (
          <button
            type="button"
            onClick={() => setMode('analysis')}
            className="inline-flex items-center gap-1.5 font-body text-sm text-[#888] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back to analysis
          </button>
        ) : (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 font-body text-sm text-[#888] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Dashboard
          </Link>
        )}
        {mode !== 'scanning' ? roleSelector : null}
      </div>

      <AnimatePresence mode="wait">
        {mode === 'analysis' ? (
          <motion.div
            key="analysis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -32, scale: 0.98 }}
            transition={SPRING}
            className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:gap-10"
          >
            <aside className="flex flex-col gap-6 md:sticky md:top-6 md:self-start">
              <div className="glass-card flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] p-6">
                <motion.div layoutId="score-gauge" transition={SPRING}>
                  <div className="relative">
                    <ScoreGauge score={analysis.score} size={230} />
                    {isReanalyzing ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                        <Loader2
                          className="h-6 w-6 animate-spin text-[#FF6733]"
                          strokeWidth={2}
                        />
                      </div>
                    ) : null}
                  </div>
                </motion.div>

                <div className="mt-4 w-full border-t border-white/[0.06] pt-5">
                  <p className="font-label text-[10px] font-semibold uppercase tracking-[0.24em] text-[#666]">
                    Resume Balance
                  </p>
                  <BalanceRadar breakdown={analysis.breakdown} height={220} />
                </div>
              </div>
            </aside>

            <section className="flex flex-col gap-5">
              <header className="flex flex-col gap-1.5">
                <p className="font-label text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF6733]">
                  What Scout Found
                </p>
                <p className="font-body text-sm text-[#888]">
                  {openIssues.length === 0
                    ? 'No open issues.'
                    : `${openIssues.length} ${
                        openIssues.length === 1 ? 'issue' : 'issues'
                      } detected`}
                </p>
              </header>

              {suggestions.length === 0 ? (
                <div className="glass-card flex items-center gap-4 rounded-2xl border border-white/[0.06] p-6 md:p-7">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-500/15 ring-1 ring-green-500/30">
                    <CheckCircle2
                      className="h-6 w-6 text-green-400"
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
                  {suggestions.map((suggestion, index) => (
                    <motion.div
                      key={suggestion.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.4,
                        ease: 'easeOut',
                        delay: index * 0.06,
                      }}
                    >
                      <SuggestionCard
                        suggestion={suggestion}
                        fixed={false}
                        onToggleDismiss={handleToggleDismiss}
                        onFix={handleRewriteAgain}
                      />
                    </motion.div>
                  ))}
                </div>
              )}

              <RefactorCta
                isPro={isPro}
                hasRewrite={rewriteData !== null}
                errorMessage={rewriteError}
                onRewrite={handleRewrite}
                onRewriteAgain={handleRewriteAgain}
              />
            </section>
          </motion.div>
        ) : null}

        {mode === 'scanning' ? (
          <motion.div
            key="scanning"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={SPRING}
            className="py-6"
          >
            <ResumeScanner />
          </motion.div>
        ) : null}

        {mode === 'refactor' && rewriteData ? (
          <motion.div key="refactor" initial={false}>
            <RefactorProvider
              rewrittenResume={rewriteData.rewrittenResume}
              beforeAfter={rewriteData.beforeAfter}
            >
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
                <motion.aside
                  initial={{ opacity: 0, x: -40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={SPRING}
                  className="flex flex-col gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1"
                >
                  <motion.div layoutId="score-gauge" transition={SPRING}>
                    <div className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-md">
                      <ScoreGauge score={analysis.score} size={64} variant="compact" />
                      <div className="min-w-0">
                        <p
                          className="font-label text-[10px] font-semibold uppercase tracking-[0.2em]"
                          style={{ color: scoreColor(analysis.score) }}
                        >
                          {scoreLabel(analysis.score)}
                        </p>
                        <p className="mt-0.5 truncate font-body text-sm text-[#bbb]">
                          {displayRole(analysis.target_role)}
                        </p>
                      </div>
                      <ScoutLogo className="ml-auto h-5 w-5 shrink-0 text-[#333]" />
                    </div>
                  </motion.div>

                  <ChangeList />
                </motion.aside>

                <motion.section
                  initial={{ opacity: 0, x: 64, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ ...SPRING, delay: 0.05 }}
                >
                  <RefactorPreview
                    resumeId={analysis.resume_id}
                    analysisId={rewriteData.analysisId}
                    userName={userName}
                  />
                </motion.section>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: 0.2 }}
                className="glass-card mt-8 flex flex-col items-center gap-4 rounded-2xl border border-white/[0.06] p-7 text-center md:p-8"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md">
                  <Compass className="h-6 w-6 text-[#FF6733]" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-headline text-xl font-medium tracking-[-0.01em] text-white">
                    Your resume is ready — put it to work
                  </p>
                  <p className="mx-auto mt-2 max-w-md font-body text-sm leading-relaxed text-[#999]">
                    Scout matches internships against your refactored resume, so
                    your best-fit roles are already waiting on the Jobs page.
                  </p>
                </div>
                <Button asChild size="lg">
                  <Link href="/explore">
                    See your matched jobs
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </Link>
                </Button>
              </motion.div>
            </RefactorProvider>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ProUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        title="Resume refactoring is a Pro feature"
        description="Upgrade to let Scout rewrite your resume in Jake-ATS format and fix every issue from your analysis. Free accounts can still upload, score, and review weaknesses."
      />
    </motion.div>
  )
}

interface RefactorCtaProps {
  isPro: boolean
  hasRewrite: boolean
  errorMessage: string | null
  onRewrite: () => void
  onRewriteAgain: () => void
}

function RefactorCta({
  isPro,
  hasRewrite,
  errorMessage,
  onRewrite,
  onRewriteAgain,
}: RefactorCtaProps) {
  return (
    <div className="glass-card mt-2 flex flex-col items-center gap-4 rounded-2xl border border-white/[0.06] p-7 text-center md:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md">
        <ScoutLogo className="h-6 w-6 text-[#FF6733]" />
      </div>
      <div>
        <p className="font-headline text-xl font-medium tracking-[-0.01em] text-white">
          {errorMessage
            ? 'Refactor didn’t finish'
            : hasRewrite
              ? 'Your refactored resume is ready'
              : 'Ready to refactor?'}
        </p>
        <p className="mx-auto mt-2 max-w-md font-body text-sm leading-relaxed text-[#999]">
          {errorMessage
            ? errorMessage
            : hasRewrite
              ? 'Review every change side by side and download the PDF — or run another pass. Scout builds on your refactored resume, so each pass pushes your score higher.'
              : 'Scout will rewrite your resume using the Jake-ATS proof format, fixing every issue above.'}
        </p>
      </div>

      {isPro || hasRewrite ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button type="button" size="lg" onClick={onRewrite}>
            {errorMessage
              ? 'Try again'
              : hasRewrite
                ? 'Open refactored resume'
                : 'Refactor with Scout'}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Button>
          {hasRewrite && !errorMessage ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={onRewriteAgain}
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Refactor again
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <Button type="button" size="lg" variant="outline" onClick={onRewrite}>
            <Lock className="h-4 w-4" strokeWidth={2} />
            Refactor with Scout
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Button>
          <p className="font-body text-xs text-[#666]">
            Pro feature — Upgrade to unlock
          </p>
        </>
      )}
    </div>
  )
}

function AnalysisSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6 h-4 w-24 animate-pulse rounded-full bg-white/5" />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:gap-10">
        <aside className="flex flex-col gap-6">
          <div className="glass-card flex flex-col items-center gap-6 rounded-2xl border border-white/[0.06] p-6">
            <div className="h-[230px] w-[230px] animate-pulse rounded-full bg-white/5" />
            <div className="h-[200px] w-full animate-pulse rounded-xl bg-white/5" />
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
              className="h-36 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
            />
          ))}
        </section>
      </div>
    </div>
  )
}
