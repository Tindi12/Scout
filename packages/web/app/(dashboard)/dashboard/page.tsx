'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  FileText,
  TrendingUp,
  Upload,
} from 'lucide-react'

import { ProfilePromptOverlay } from '@/components/profile/ProfilePromptOverlay'
import { ResumeUpload } from '@/components/resume/ResumeUpload'
import { Button } from '@/components/ui/button'
import { isProfilePromptDismissed } from '@/lib/profile-prompt-dismiss'
import {
  RESUME_UPLOAD_SECTION_ID,
  scrollToResumeUpload,
} from '@/lib/scroll-to-resume-upload'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Status = 'loading' | 'empty' | 'loaded' | 'error'

type UserRow = {
  id: string
  name: string | null
  target_roles: string[] | null
  profile_complete: boolean | null
}

type AnalysisRow = {
  id: string
  score: number | null
  created_at: string
}

const LAST_ANALYSIS_ID_KEY = 'scout:last_analysis_id'
const LAST_ANALYSIS_TS_KEY = 'scout:last_analysis_ts'

type ApplicationRow = {
  id: string
  status: string | null
  company: string | null
  role: string | null
}

type ScoutRunRow = {
  id: string
  status: string | null
  created_at: string
  completed_at: string | null
  applications:
    | Array<{
        id: string
        company: string | null
        role: string | null
        status: string | null
      }>
    | null
}

const REPLY_STATUSES = new Set([
  'phone_screen',
  'interview',
  'offer',
  'reply',
  'replied',
])

const ACTIVE_RUN_STATUSES = new Set(['running', 'in_progress', 'queued'])

export default function DashboardPage() {
  const { user, isLoaded: clerkLoaded } = useUser()

  const [userState, setUserState] = useState<{
    status: Status
    data?: UserRow
  }>({ status: 'loading' })
  const [analysesState, setAnalysesState] = useState<{
    status: Status
    data?: AnalysisRow[]
  }>({ status: 'loading' })
  const [appsState, setAppsState] = useState<{
    status: Status
    data?: ApplicationRow[]
  }>({ status: 'loading' })
  const [runState, setRunState] = useState<{
    status: Status
    data?: ScoutRunRow
  }>({ status: 'loading' })
  const [profilePromptHidden, setProfilePromptHidden] = useState(false)
  const [showResumeUpload, setShowResumeUpload] = useState(false)

  const openResumeUpload = useCallback(() => {
    setShowResumeUpload(true)
    window.requestAnimationFrame(() => {
      scrollToResumeUpload()
    })
  }, [])

  useEffect(() => {
    if (!user?.id) return
    setProfilePromptHidden(isProfilePromptDismissed(user.id))
  }, [user?.id])

  // Fetch the Supabase user row first — we need its id for the other queries.
  // Go through /api/user/me (service role) so RLS doesn't hide the row from
  // the anon-key client.
  useEffect(() => {
    if (!clerkLoaded) return
    if (!user?.id) {
      setUserState({ status: 'empty' })
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/user/me', {
          method: 'GET',
          cache: 'no-store',
        })
        if (cancelled) return
        if (!res.ok) {
          setUserState({ status: 'error' })
          return
        }
        const body = (await res.json()) as {
          id?: string | null
          target_roles?: unknown
          profile_complete?: boolean | null
          profile?: { name?: string | null } | null
        }
        setUserState({
          status: 'loaded',
          data: {
            id: body?.id ? String(body.id) : '',
            name: body.profile?.name ?? null,
            target_roles: Array.isArray(body.target_roles)
              ? (body.target_roles as string[])
              : [],
            profile_complete: body?.profile_complete === true,
          },
        })
      } catch {
        if (!cancelled) setUserState({ status: 'error' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [clerkLoaded, user?.id])

  const supabaseUserId = userState.data?.id ?? null

  const fetchAnalyses = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/resume/analyses?limit=5', {
        method: 'GET',
        cache: 'no-store',
        signal,
      })
      if (!res.ok) {
        setAnalysesState({ status: 'empty' })
        return
      }
      const body = (await res.json()) as { analyses?: AnalysisRow[] }
      const rows = Array.isArray(body.analyses) ? body.analyses : []
      setAnalysesState(
        rows.length > 0
          ? { status: 'loaded', data: rows }
          : { status: 'empty' },
      )
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return
      setAnalysesState({ status: 'empty' })
    }
  }, [])

  useEffect(() => {
    if (!supabaseUserId) {
      if (userState.status !== 'loading') {
        setAnalysesState({ status: 'empty' })
        setAppsState({ status: 'empty' })
        setRunState({ status: 'empty' })
      }
      return
    }

    let cancelled = false
    const controller = new AbortController()

    void fetchAnalyses(controller.signal)

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('applications')
          .select('id, status, company, role')
          .eq('user_id', supabaseUserId)

        if (cancelled) return
        if (error) {
          setAppsState({ status: 'empty' })
          return
        }
        setAppsState(
          data && data.length > 0
            ? { status: 'loaded', data: data as ApplicationRow[] }
            : { status: 'empty' },
        )
      } catch {
        if (!cancelled) setAppsState({ status: 'empty' })
      }
    })()

    void (async () => {
      try {
        const active = await supabase
          .from('scout_runs')
          .select(
            'id, status, created_at, completed_at, applications(id, company, role, status)',
          )
          .eq('user_id', supabaseUserId)
          .eq('status', 'running')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return

        if (active.data) {
          setRunState({ status: 'loaded', data: active.data as ScoutRunRow })
          return
        }

        const recent = await supabase
          .from('scout_runs')
          .select(
            'id, status, created_at, completed_at, applications(id, company, role, status)',
          )
          .eq('user_id', supabaseUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return
        if (recent.data) {
          setRunState({ status: 'loaded', data: recent.data as ScoutRunRow })
        } else {
          setRunState({ status: 'empty' })
        }
      } catch {
        if (!cancelled) setRunState({ status: 'empty' })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [supabaseUserId, userState.status, fetchAnalyses])

  // Refresh the Scout Score when the user comes back to the dashboard
  // (returning from /resume/analysis after a new analyze) or when another
  // tab signals a new analysis via localStorage.
  useEffect(() => {
    if (!supabaseUserId) return

    const refresh = () => {
      void fetchAnalyses()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const onFocus = () => refresh()
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === LAST_ANALYSIS_ID_KEY ||
        event.key === LAST_ANALYSIS_TS_KEY
      ) {
        refresh()
      }
    }

    window.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [supabaseUserId, fetchAnalyses])

  const firstName = useMemo(() => {
    if (userState.data?.name) return userState.data.name.split(' ')[0]
    return (
      user?.firstName ??
      user?.username ??
      user?.fullName?.split(' ')[0] ??
      'there'
    )
  }, [user, userState.data?.name])

  const hasResume =
    analysesState.status === 'loaded' && (analysesState.data?.length ?? 0) > 0
  const isNewUser =
    userState.status === 'loaded' &&
    !hasResume &&
    analysesState.status !== 'loading'

  const latestAnalysis = analysesState.data?.[0]
  const previousAnalysis = analysesState.data?.[1]
  const scoreDelta =
    latestAnalysis?.score != null && previousAnalysis?.score != null
      ? latestAnalysis.score - previousAnalysis.score
      : null

  const applications = appsState.data ?? []
  const appliedCount = applications.length
  const repliesCount = applications.filter((a) =>
    REPLY_STATUSES.has((a.status ?? '').toLowerCase()),
  ).length

  const strongFitsCount = 0 // job matching engine not wired yet

  const showProfilePrompt =
    Boolean(user?.id) &&
    clerkLoaded &&
    userState.status === 'loaded' &&
    userState.data?.profile_complete !== true &&
    !profilePromptHidden

  useEffect(() => {
    if (!user?.id) return
    if (window.location.hash !== `#${RESUME_UPLOAD_SECTION_ID}`) return
    if (hasResume) setShowResumeUpload(true)
    const id = window.requestAnimationFrame(() => {
      scrollToResumeUpload()
    })
    return () => window.cancelAnimationFrame(id)
  }, [user?.id, hasResume])

  const showUploadSection =
    Boolean(user?.id) && (!hasResume || showResumeUpload)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      {user?.id ? (
        <ProfilePromptOverlay
          clerkUserId={user.id}
          open={showProfilePrompt}
          onDismiss={() => setProfilePromptHidden(true)}
        />
      ) : null}

      <Greeting
        firstName={firstName}
        isNewUser={isNewUser}
        strongFitsCount={strongFitsCount}
        loading={!clerkLoaded || userState.status === 'loading'}
      />

      {isNewUser ? (
        <OnboardingChecklist
          hasTargetRoles={(userState.data?.target_roles?.length ?? 0) > 0}
          onUploadClick={scrollToResumeUpload}
        />
      ) : (
        <StatGrid
          loading={
            analysesState.status === 'loading' || appsState.status === 'loading'
          }
          score={latestAnalysis?.score ?? null}
          previousScore={previousAnalysis?.score ?? null}
          delta={scoreDelta}
          applied={appliedCount}
          replies={repliesCount}
          appsLoaded={appsState.status !== 'loading'}
          analysesLoaded={analysesState.status !== 'loading'}
        />
      )}

      <LiveAgentRun state={runState} />

      {userState.status === 'loaded' &&
      userState.data?.profile_complete === false ? (
        <ProfileIncompleteCta />
      ) : null}

      {hasResume ? (
        <ResumeSummary
          score={latestAnalysis?.score ?? 0}
          analysisId={latestAnalysis?.id ?? null}
          onUploadNew={openResumeUpload}
        />
      ) : null}

      {showUploadSection ? (
        <section
          id={RESUME_UPLOAD_SECTION_ID}
          className="scroll-mt-6"
        >
          {hasResume && showResumeUpload ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-label text-[11px] font-medium uppercase tracking-[0.22em] text-[#666]">
                Replace resume
              </p>
              <button
                type="button"
                onClick={() => setShowResumeUpload(false)}
                className="font-label text-xs text-[#888] transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : null}
          <ResumeUpload
            userId={user!.id}
            supabaseUserId={userState.data?.id ?? ''}
            onSuccess={() => {
              setShowResumeUpload(false)
              void fetchAnalyses()
            }}
          />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <CopilotTeaser />
        <QuickActions />
      </div>
    </div>
  )
}

function Greeting({
  firstName,
  isNewUser,
  strongFitsCount,
  loading,
}: {
  firstName: string
  isNewUser: boolean
  strongFitsCount: number
  loading: boolean
}) {
  return (
    <header className="space-y-2">
      <p className="font-label text-[11px] font-medium uppercase tracking-[0.22em] text-[#666]">
        Welcome back
      </p>
      {loading ? (
        <Skeleton className="h-10 w-72" />
      ) : (
        <h1 className="font-headline text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
          {isNewUser ? (
            <>
              {firstName}, let&apos;s get Scout ready.
            </>
          ) : strongFitsCount > 0 ? (
            <>
              {firstName}, you have{' '}
              <span className="text-[#FF6733]">{strongFitsCount}</span> strong
              fits today.
            </>
          ) : (
            <>{firstName}, your dashboard is ready.</>
          )}
        </h1>
      )}
    </header>
  )
}

type ChecklistStep = {
  id: string
  label: string
  cta?: string
  href?: string
}

const CHECKLIST_STEPS: readonly ChecklistStep[] = [
  { id: 'upload', label: 'Upload your resume', cta: 'Upload' },
  { id: 'score', label: 'Scout scores and rewrites it' },
  { id: 'jobs', label: 'Browse your matched jobs' },
  { id: 'apply', label: 'Send Scout to apply' },
]

function OnboardingChecklist({
  hasTargetRoles,
  onUploadClick,
}: {
  hasTargetRoles: boolean
  onUploadClick: () => void
}) {
  // Active step is "Upload resume" until resume is uploaded.
  // Roles being chosen at onboarding doesn't shift this — the dashboard's
  // first action is always the resume upload.
  const activeIndex = 0
  void hasTargetRoles

  return (
    <section className="glass-card rounded-2xl p-6 md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-label text-[11px] font-medium uppercase tracking-[0.22em] text-[#FF6733]">
          Get started
        </h2>
        <span className="font-label text-[11px] uppercase tracking-wider text-[#666]">
          Step {activeIndex + 1} of {CHECKLIST_STEPS.length}
        </span>
      </div>

      <ol className="space-y-3">
        {CHECKLIST_STEPS.map((step, i) => {
          const done = i < activeIndex
          const active = i === activeIndex
          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors',
                active
                  ? 'border-[#FF6733]/40 bg-primary/[0.05]'
                  : 'border-white/[0.06] bg-white/[0.01]',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                    done
                      ? 'border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]'
                      : active
                        ? 'border-[#FF6733]/50 bg-primary/15 text-[#FF6733]'
                        : 'border-white/[0.08] bg-white/[0.03] text-[#666]',
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'font-body text-sm',
                    active
                      ? 'text-white'
                      : done
                        ? 'text-[#888] line-through'
                        : 'text-[#888]',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {active && step.cta ? (
                step.id === 'upload' ? (
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 gap-1.5 px-4 py-1.5 text-[12px]"
                    onClick={onUploadClick}
                  >
                    {step.cta}
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </Button>
                ) : step.href ? (
                  <Button asChild size="sm" className="shrink-0 gap-1.5 px-4 py-1.5 text-[12px]">
                    <Link href={step.href}>
                      {step.cta}
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </Link>
                  </Button>
                ) : null
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function StatGrid({
  loading,
  score,
  previousScore,
  delta,
  applied,
  replies,
  appsLoaded,
  analysesLoaded,
}: {
  loading: boolean
  score: number | null
  previousScore: number | null
  delta: number | null
  applied: number
  replies: number
  appsLoaded: boolean
  analysesLoaded: boolean
}) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Scout Score"
        loading={loading || !analysesLoaded}
        value={score != null ? String(score) : null}
        emptyValue="—"
        emptyCta={{
          href: `#${RESUME_UPLOAD_SECTION_ID}`,
          label: 'Upload resume to get your score',
        }}
        delta={delta}
        subtext={
          previousScore != null && score != null
            ? `vs. ${previousScore} before Scout`
            : score != null
              ? 'analyzed by Scout'
              : undefined
        }
      />
      <StatCard
        label="Applied"
        loading={loading || !appsLoaded}
        value={String(applied)}
        emptyValue="0"
        emptyCta={
          applied === 0
            ? { href: '/explore', label: 'Run Scout to start applying' }
            : undefined
        }
        subtext={applied > 0 ? 'internships this session' : undefined}
      />
      <StatCard
        label="Replies"
        loading={loading || !appsLoaded}
        value={replies > 0 ? String(replies) : null}
        emptyValue="—"
        valueAccent
        subtext={
          replies > 0 ? 'responses received' : 'Replies appear here'
        }
      />
    </section>
  )
}

function StatCard({
  label,
  loading,
  value,
  emptyValue,
  emptyCta,
  delta,
  subtext,
  valueAccent,
}: {
  label: string
  loading: boolean
  value: string | null
  emptyValue: string
  emptyCta?: { href: string; label: string }
  delta?: number | null
  subtext?: string
  valueAccent?: boolean
}) {
  const isEmpty = !loading && (value === null || value === '')

  return (
    <div className="glass-card flex flex-col justify-between rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between">
        <span className="font-label text-[11px] font-medium uppercase tracking-[0.22em] text-[#666]">
          {label}
        </span>
        {delta != null && delta > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-label text-[11px] font-semibold text-[#FF6733]">
            <TrendingUp className="h-3 w-3" strokeWidth={2.25} />+{delta}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-12 w-24" />
        ) : (
          <div
            className={cn(
              'font-headline text-[48px] font-medium leading-none tracking-[-0.03em]',
              valueAccent && !isEmpty ? 'text-[#FF6733]' : 'text-white',
              isEmpty && 'text-[#444]',
            )}
          >
            {isEmpty ? emptyValue : value}
          </div>
        )}
      </div>

      <div className="mt-3 min-h-[18px]">
        {loading ? (
          <Skeleton className="h-3 w-32" />
        ) : isEmpty && emptyCta ? (
          <Link
            href={emptyCta.href}
            className="inline-flex items-center gap-1 font-body text-xs text-[#888] transition-colors hover:text-[#FF6733]"
          >
            {emptyCta.label}
            <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        ) : subtext ? (
          <span className="font-body text-xs text-[#666]">{subtext}</span>
        ) : null}
      </div>
    </div>
  )
}

function LiveAgentRun({
  state,
}: {
  state: { status: Status; data?: ScoutRunRow }
}) {
  if (state.status === 'loading') {
    return (
      <section className="glass-card rounded-2xl p-5 md:p-6">
        <Skeleton className="mb-4 h-3 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    )
  }

  if (state.status !== 'loaded' || !state.data) {
    return null
  }

  const run = state.data
  const isActive = ACTIVE_RUN_STATUSES.has((run.status ?? '').toLowerCase())
  const apps = run.applications ?? []

  if (!isActive) {
    const submitted = apps.filter(
      (a) => (a.status ?? '').toLowerCase() === 'submitted',
    ).length
    const needsAttention = apps.filter((a) => {
      const s = (a.status ?? '').toLowerCase()
      return s === 'failed' || s === 'needs_attention'
    }).length

    return (
      <section className="glass-card rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-label text-[11px] font-medium uppercase tracking-[0.22em] text-[#666]">
              Last Scout Run
            </h2>
            <p className="mt-2 font-body text-sm text-[#999]">
              {formatRelativeTime(run.completed_at ?? run.created_at)}
              {' — '}
              <span className="text-white">{submitted}</span> submitted
              {needsAttention > 0 ? (
                <>
                  ,{' '}
                  <span className="text-[#FF6733]">{needsAttention}</span>{' '}
                  needs attention
                </>
              ) : null}
            </p>
          </div>
          <Link
            href="/tracker"
            className="font-label text-xs font-medium text-[#FF6733] transition-opacity hover:opacity-80"
          >
            View tracker →
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="glass-card rounded-2xl p-5 md:p-6">
      <header className="mb-4 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
        </span>
        <h2 className="font-label text-[11px] font-medium uppercase tracking-[0.22em] text-[#FF6733]">
          Live Agent Run
        </h2>
      </header>

      <ul className="divide-y divide-white/[0.05]">
        {apps.length === 0 ? (
          <li className="py-3 font-body text-sm text-[#666]">
            Spinning up applications…
          </li>
        ) : (
          apps.map((app) => (
            <li
              key={app.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0 truncate font-body text-sm text-white">
                <span className="text-white">{app.company ?? 'Company'}</span>
                <span className="text-[#666]"> — </span>
                <span className="text-[#999]">{app.role ?? 'Role'}</span>
              </span>
              <ApplicationStatusPill status={app.status} />
            </li>
          ))
        )}
      </ul>
    </section>
  )
}

function ApplicationStatusPill({ status }: { status: string | null }) {
  const s = (status ?? '').toLowerCase()
  let label = 'QUEUED'
  let classes = 'bg-white/[0.04] text-[#888]'

  if (s === 'submitted' || s === 'completed' || s === 'applied') {
    label = 'SUBMITTED'
    classes = 'bg-[#22c55e]/15 text-[#22c55e]'
  } else if (
    s === 'filling_form' ||
    s === 'in_progress' ||
    s === 'navigating' ||
    s === 'running'
  ) {
    label = 'FILLING FORM'
    classes = 'bg-primary/15 text-[#FF6733]'
  } else if (s === 'failed' || s === 'error') {
    label = 'FAILED'
    classes = 'bg-[#ef4444]/15 text-[#ef4444]'
  } else if (s === 'needs_attention') {
    label = 'NEEDS REVIEW'
    classes = 'bg-[#ef4444]/15 text-[#ef4444]'
  }

  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wider',
        classes,
      )}
    >
      {label}
    </span>
  )
}

function ResumeSummary({
  score,
  analysisId,
  onUploadNew,
}: {
  score: number
  analysisId: string | null
  onUploadNew: () => void
}) {
  const analysisHref = analysisId
    ? `/resume/analysis?id=${encodeURIComponent(analysisId)}`
    : '/resume/analysis'

  return (
    <section className="glass-card flex flex-col gap-4 rounded-2xl p-5 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
      <Link
        href={analysisHref}
        className="group flex min-w-0 flex-1 items-center gap-4"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <FileText className="h-5 w-5 text-[#FF6733]" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.22em] text-[#666]">
            Resume Score
          </p>
          <p className="mt-1 font-headline text-xl font-medium tracking-tight text-white">
            {score}
            <span className="ml-1 font-body text-sm text-[#666]">/ 100</span>
          </p>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onUploadNew}>
          <Upload className="h-3.5 w-3.5" strokeWidth={2} />
          Upload new
        </Button>
        <Button asChild size="sm" className="group gap-1.5">
          <Link href={analysisHref}>
            View analysis
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </Button>
      </div>
    </section>
  )
}

function CopilotTeaser() {
  return (
    <Link
      href="/copilot"
      className="glass-card group flex flex-col gap-4 rounded-2xl p-6 transition-colors hover:bg-white/[0.04]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
        <Bot className="h-5 w-5 text-[#FF6733]" strokeWidth={1.75} />
      </div>
      <div>
        <h3 className="font-headline text-xl font-medium tracking-[-0.01em] text-white">
          Ask Scout anything
        </h3>
        <p className="mt-1 font-body text-sm text-[#999]">
          Your resume, your roles, your gaps — Scout knows it all.
        </p>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 font-body text-sm text-[#666] transition-colors group-hover:border-[#FF6733]/30 group-hover:bg-primary/[0.04]">
        <span>Am I ready for Stripe?</span>
        <ArrowRight
          className="h-4 w-4 text-[#666] transition-colors group-hover:text-[#FF6733]"
          strokeWidth={2}
        />
      </div>
    </Link>
  )
}

const QUICK_ACTIONS = [
  { label: 'View your matched jobs', href: '/explore' },
  { label: 'Check role alignment', href: '/roles' },
  { label: 'Track your applications', href: '/tracker' },
  { label: 'Optimize your resume', href: '/resume' },
] as const

function QuickActions() {
  return (
    <div className="glass-card flex flex-col gap-1 rounded-2xl p-6">
      <h3 className="mb-3 font-label text-[11px] font-medium uppercase tracking-[0.22em] text-[#666]">
        Quick actions
      </h3>
      <ul className="-mx-2 flex flex-col">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 font-body text-sm text-[#999] transition-colors hover:bg-white/[0.03] hover:text-white"
            >
              <span className="inline-flex items-center gap-2">
                <CircleDashed
                  className="h-3.5 w-3.5 text-[#444] transition-colors group-hover:text-[#FF6733]"
                  strokeWidth={2}
                />
                {action.label}
              </span>
              <ArrowRight
                className="h-4 w-4 text-[#444] transition-all group-hover:translate-x-0.5 group-hover:text-[#FF6733]"
                strokeWidth={2}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfileIncompleteCta() {
  return (
    <section className="glass-card rounded-2xl border border-white/[0.06] p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FF6733]/30 bg-primary/[0.08]">
            <AlertCircle
              className="h-[18px] w-[18px] text-[#FF6733]"
              strokeWidth={1.75}
            />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-headline text-base font-medium text-white">
              Complete your profile before Scout applies
            </h3>
            <p className="mt-1 text-sm text-[#888]">
              Scout needs your details to fill applications correctly.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/profile">
            Complete Profile
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  )
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diff = Math.max(0, now - then)
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  } catch {
    return 'recently'
  }
}
