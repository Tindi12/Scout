'use client'

import {
  AlertCircle,
  ChevronDown,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'

import { JobCard, type JobMatch } from '@/components/jobs/JobCard'
import { ColumnSelectActions, JobColumn } from '@/components/jobs/JobColumn'
import { ProUpgradeDialog } from '@/components/ProUpgradeDialog'
import { ProfileRequiredDialog } from '@/components/profile/ProfileRequiredDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useExploreBatch } from '@/contexts/explore-batch-context'
import { cn } from '@/lib/utils'
import { RESUME_UPLOAD_SECTION_ID } from '@/lib/scroll-to-resume-upload'
import { queueApplication } from '@/app/actions/applications'
import {
  computeProfileCompletion,
  type ProfileData,
} from '@/lib/profile-completion'
import {
  hasPaidFeatures,
  normalizeSubscriptionPlan,
} from '@/lib/subscription-plan'

type PageStatus = 'loading' | 'no_resume' | 'error' | 'loaded'
type FilterKey = 'all' | 'remote' | 'visa'

type UserSummary = {
  id: string | null
  isPro: boolean
  profileComplete: boolean
  missingFieldLabels: string[]
}

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'remote', label: 'Remote Only' },
  { key: 'visa', label: 'Visa Friendly' },
]

export default function ExplorePage() {
  const { toast } = useToast()
  const { setBatch, requestPulse, credits, refreshCredits } = useExploreBatch()

  const [user, setUser] = useState<UserSummary | null>(null)
  const [userLoaded, setUserLoaded] = useState(false)

  const [status, setStatus] = useState<PageStatus>('loading')
  const [jobs, setJobs] = useState<JobMatch[]>([])
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [refreshing, setRefreshing] = useState(false)

  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [tailoredJobIds, setTailoredJobIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [showProGate, setShowProGate] = useState(false)
  const [showProfileGate, setShowProfileGate] = useState(false)
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)
  const [isSending, startSending] = useTransition()

  const hasPulsedRef = useRef(false)
  const autoSelectedKeyRef = useRef<string | null>(null)

  // 1. Load the Scout user row (need is_pro + supabase id).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/user/me', {
          method: 'GET',
          cache: 'no-store',
        })
        if (cancelled) return
        if (!res.ok) {
          setUser({
            id: null,
            isPro: false,
            profileComplete: false,
            missingFieldLabels: [],
          })
          setUserLoaded(true)
          return
        }
        const body = (await res.json()) as {
          id?: string | null
          is_pro?: boolean | null
          subscription_plan?: string | null
          profile?: Partial<ProfileData> | null
          profile_complete?: boolean | null
        }
        const plan = normalizeSubscriptionPlan(
          body.subscription_plan,
          body.is_pro,
        )
        const completion = computeProfileCompletion(body.profile ?? undefined)
        setUser({
          id: body.id ?? null,
          isPro: hasPaidFeatures(plan, body.is_pro),
          profileComplete: Boolean(
            body.profile_complete ?? completion.profileComplete,
          ),
          missingFieldLabels: completion.missingFieldLabels,
        })
        setUserLoaded(true)
      } catch {
        if (!cancelled) {
          setUser({
            id: null,
            isPro: false,
            profileComplete: false,
            missingFieldLabels: [],
          })
          setUserLoaded(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 2. Load matches once we know the user state.
  const loadMatches = useCallback(async () => {
    setStatus('loading')
    setErrorMessage('')
    autoSelectedKeyRef.current = null
    hasPulsedRef.current = false
    setSelectedJobIds(new Set())
    try {
      const res = await fetch('/api/jobs/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
        cache: 'no-store',
      })

      if (!res.ok) {
        let detail = `Could not load matches (HTTP ${res.status}).`
        try {
          const parsed = (await res.json()) as { detail?: unknown }
          if (typeof parsed?.detail === 'string') detail = parsed.detail
        } catch {
          /* keep default */
        }
        if (
          res.status === 404 &&
          detail.toLowerCase().includes('resume')
        ) {
          setStatus('no_resume')
          return
        }
        setErrorMessage(detail)
        setStatus('error')
        return
      }

      const data = (await res.json()) as JobMatch[]
      const list = Array.isArray(data) ? data : []
      list.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))
      setJobs(list)
      setStatus('loaded')
    } catch {
      setErrorMessage('Network error. Please try again.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!userLoaded) return
    void loadMatches()
  }, [userLoaded, loadMatches])

  useEffect(() => {
    if (!userLoaded) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/resume/analyses?limit=1', {
          cache: 'no-store',
        })
        if (cancelled || !res.ok) return
        const body = (await res.json()) as {
          analyses?: Array<{ resume_id?: string }>
        }
        const rid = body.analyses?.[0]?.resume_id?.trim()
        if (rid) setResumeId(rid)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userLoaded])

  useEffect(() => {
    if (!resumeId || status !== 'loaded') return
    let cancelled = false
    void (async () => {
      try {
        const qs = new URLSearchParams({ resume_id: resumeId })
        const res = await fetch(`/api/resume/variants?${qs}`, {
          cache: 'no-store',
        })
        if (cancelled || !res.ok) return
        const body = (await res.json()) as { job_ids?: string[] }
        const ids = Array.isArray(body.job_ids) ? body.job_ids : []
        setTailoredJobIds(new Set(ids))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resumeId, status])

  const handleVariantCached = useCallback((jobId: string) => {
    setTailoredJobIds((prev) => {
      const next = new Set(prev)
      next.add(jobId)
      return next
    })
  }, [])

  const handleRefresh = useCallback(() => {
    if (refreshing || status === 'loading') return
    setRefreshing(true)
    void loadMatches().finally(() => setRefreshing(false))
  }, [loadMatches, refreshing, status])

  // Client-side filter
  const filteredJobs = useMemo(() => {
    if (filter === 'remote') return jobs.filter((j) => j.remote === true)
    if (filter === 'visa') return jobs.filter((j) => j.visa_sponsorship === 'yes')
    return jobs
  }, [jobs, filter])

  const strongJobs = useMemo(
    () => filteredJobs.filter((j) => j.category === 'STRONG_FIT'),
    [filteredJobs],
  )
  const goodJobs = useMemo(
    () => filteredJobs.filter((j) => j.category === 'GOOD_FIT'),
    [filteredJobs],
  )
  const stretchJobs = useMemo(
    () => filteredJobs.filter((j) => j.category === 'STRETCH'),
    [filteredJobs],
  )

  // Auto-select all STRONG_FIT jobs once per fresh load. Re-fires when the
  // job list itself changes (a refresh resets the key via loadMatches).
  useEffect(() => {
    if (status !== 'loaded') return
    const key = jobs.map((j) => j.id).join('|')
    if (autoSelectedKeyRef.current === key) return
    autoSelectedKeyRef.current = key
    const strongIds = jobs
      .filter((j) => j.category === 'STRONG_FIT')
      .map((j) => j.id)
    setSelectedJobIds(new Set(strongIds))
  }, [jobs, status])

  const creditsRemaining = credits?.remaining ?? null

  const handleToggleSelect = useCallback((jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedJobIds(new Set(filteredJobs.map((j) => j.id)))
  }, [filteredJobs])

  const handleDeselectAll = useCallback(() => {
    setSelectedJobIds(new Set())
  }, [])

  const handleSelectColumn = useCallback((columnJobs: JobMatch[]) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev)
      for (const job of columnJobs) next.add(job.id)
      return next
    })
  }, [])

  const handleDeselectColumn = useCallback((columnJobs: JobMatch[]) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev)
      for (const job of columnJobs) next.delete(job.id)
      return next
    })
  }, [])

  const handleSendScoutClick = useCallback(() => {
    if (selectedJobIds.size === 0) return
    if (!user?.isPro) {
      setShowProGate(true)
      return
    }
    if (!user.profileComplete) {
      setShowProfileGate(true)
      return
    }
    const remaining = credits?.remaining ?? 0
    if (selectedJobIds.size > remaining) {
      toast({
        title: 'Not enough application credits',
        description: `You have ${remaining} credit${remaining === 1 ? '' : 's'} left but selected ${selectedJobIds.size} job${selectedJobIds.size === 1 ? '' : 's'}. Deselect some roles or upgrade your plan.`,
        variant: 'destructive',
      })
      return
    }
    setShowBatchConfirm(true)
  }, [
    selectedJobIds.size,
    user?.isPro,
    user?.profileComplete,
    credits?.remaining,
    toast,
  ])

  const selectedJobs = useMemo(
    () => jobs.filter((j) => selectedJobIds.has(j.id)),
    [jobs, selectedJobIds],
  )

  const handleConfirmBatch = useCallback(() => {
    if (selectedJobs.length === 0) {
      setShowBatchConfirm(false)
      return
    }
    const remaining = credits?.remaining ?? 0
    if (selectedJobs.length > remaining) {
      toast({
        title: 'Not enough application credits',
        description: `You have ${remaining} credit${remaining === 1 ? '' : 's'} remaining.`,
        variant: 'destructive',
      })
      setShowBatchConfirm(false)
      return
    }
    const batch = selectedJobs
    startSending(async () => {
      const results: Awaited<ReturnType<typeof queueApplication>>[] = []
      for (const job of batch) {
        const result = await queueApplication({
          jobId: job.id,
          company: job.company,
          role: job.title,
          url: job.url,
        })
        results.push(result)
        if (
          !result.ok &&
          result.error.toLowerCase().includes('credit limit')
        ) {
          break
        }
      }
      const profileBlocked = results.some(
        (r) =>
          !r.ok &&
          r.error.toLowerCase().includes('complete your profile'),
      )
      if (profileBlocked) {
        setShowBatchConfirm(false)
        setShowProfileGate(true)
        return
      }

      const queued = results.filter((r) => r.ok).length
      const failed = batch.length - queued
      const hitCreditLimit = results.some(
        (r) =>
          !r.ok && r.error.toLowerCase().includes('credit limit'),
      )
      await refreshCredits()
      setSelectedJobIds(new Set())
      setShowBatchConfirm(false)

      if (failed === 0) {
        toast({
          title: `Scout is queued for ${queued} ${
            queued === 1 ? 'application' : 'applications'
          }.`,
          description: "You'll be notified when done.",
        })
      } else if (queued === 0) {
        toast({
          title: 'Could not queue applications',
          description: 'Scout could not queue any of the selected jobs.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: `Queued ${queued} of ${batch.length} applications`,
          description: hitCreditLimit
            ? `${queued} credit${queued === 1 ? '' : 's'} used — you hit your application limit.`
            : `${failed} could not be queued — please try again.`,
          variant: 'destructive',
        })
      }
    })
  }, [selectedJobs, credits?.remaining, toast, refreshCredits])

  const selectedCount = selectedJobIds.size

  // Wire batch send state to the top-bar Send Scout button.
  useEffect(() => {
    setBatch({
      selectedCount,
      isSending,
      onSend: handleSendScoutClick,
    })
    return () => setBatch(null)
  }, [selectedCount, isSending, handleSendScoutClick, setBatch])

  // One-time attention pulse on the top-bar Send Scout button after auto-select.
  useEffect(() => {
    if (status !== 'loaded') return
    if (hasPulsedRef.current) return
    if (selectedJobIds.size === 0) return
    hasPulsedRef.current = true
    const timer = setTimeout(() => requestPulse(), 800)
    return () => clearTimeout(timer)
  }, [selectedJobIds.size, status, requestPulse])

  const isLoading = status === 'loading'
  const showSelectionStrip = status === 'loaded' && filteredJobs.length > 0

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Header
          loading={isLoading || refreshing}
          onRefresh={handleRefresh}
          filter={filter}
          onFilterChange={setFilter}
        />

        <StatsBar
          loading={isLoading}
          strong={strongJobs.length}
          good={goodJobs.length}
          stretch={stretchJobs.length}
        />

        {showSelectionStrip ? (
          <SelectionStrip
            selectedCount={selectedCount}
            totalCount={filteredJobs.length}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
          />
        ) : null}

        {status === 'no_resume' ? (
          <NoResumeState />
        ) : status === 'error' ? (
          <ErrorState message={errorMessage} onRetry={handleRefresh} />
        ) : (
          <KanbanBoard
            loading={isLoading}
            strongJobs={strongJobs}
            goodJobs={goodJobs}
            stretchJobs={stretchJobs}
            selectedJobIds={selectedJobIds}
            onToggleSelect={handleToggleSelect}
            onSelectColumn={handleSelectColumn}
            onDeselectColumn={handleDeselectColumn}
            resumeId={resumeId}
            isPro={user?.isPro ?? false}
            tailoredJobIds={tailoredJobIds}
            onVariantCached={handleVariantCached}
          />
        )}
      </div>

      <ProUpgradeDialog
        open={showProGate}
        onOpenChange={setShowProGate}
        title="Auto-apply is a Pro feature"
        description="Upgrade to Scout Pro to send Scout to apply to internships on your behalf."
      />

      <ProfileRequiredDialog
        open={showProfileGate}
        onOpenChange={setShowProfileGate}
        missingFieldLabels={user?.missingFieldLabels ?? []}
      />

      <Dialog
        open={showBatchConfirm}
        onOpenChange={(open) => {
          if (isSending) return
          setShowBatchConfirm(open)
        }}
      >
        <DialogContent className="glass-card-strong max-w-md gap-5 rounded-2xl border-white/10 bg-[#0a0a0a]/90 p-7 text-white">
          <DialogHeader className="text-left sm:text-left">
            <DialogTitle className="font-headline text-xl font-medium tracking-[-0.02em] text-white">
              Send Scout to {selectedCount}{' '}
              {selectedCount === 1 ? 'company' : 'companies'}
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-[#999]">
              Scout will apply to all{' '}
              <span className="text-white">{selectedCount}</span>{' '}
              selected{' '}
              {selectedCount === 1 ? 'role' : 'roles'} using your optimized
              resume.
            </DialogDescription>
          </DialogHeader>

          <p className="font-body text-xs text-[#666]">
            This will use{' '}
            <span className="text-[#FF6733]">{selectedCount}</span> of your
            remaining{' '}
            <span className="text-[#FF6733]">
              {creditsRemaining != null ? creditsRemaining : '—'}
            </span>{' '}
            applications.
          </p>

          <DialogFooter className="sm:justify-end">
            <button
              type="button"
              onClick={() => setShowBatchConfirm(false)}
              disabled={isSending}
              className="inline-flex h-10 items-center justify-center rounded-full px-5 font-label text-sm font-medium text-[#999] transition-colors hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmBatch}
              disabled={
                isSending ||
                selectedCount === 0 ||
                (creditsRemaining != null && selectedCount > creditsRemaining)
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-5 font-label text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_24px_rgba(255,103,51,0.55)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  Sending…
                </>
              ) : (
                <>Send Scout →</>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Header({
  loading,
  onRefresh,
  filter,
  onFilterChange,
}: {
  loading: boolean
  onRefresh: () => void
  filter: FilterKey
  onFilterChange: (key: FilterKey) => void
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="font-headline text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
          Explore
        </h1>
        <p className="mt-1 font-body text-sm text-[#888]">
          Jobs matched to your resume
        </p>
      </div>

      <div className="flex flex-col gap-3 md:items-end">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-full border border-white/[0.08] bg-white/[0.03] px-4 font-label text-xs font-semibold text-[#bbb] transition-colors hover:border-[#FF6733]/40 hover:bg-[#FF6733]/[0.06] hover:text-white disabled:opacity-70 md:self-auto"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
            strokeWidth={2}
          />
          Refresh
        </button>

        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1">
          {FILTERS.map((f) => {
            const active = f.key === filter
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onFilterChange(f.key)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 font-label text-xs font-semibold transition-colors',
                  active
                    ? 'bg-[#FF6733] text-white shadow-[0_0_18px_rgba(255,103,51,0.35)]'
                    : 'glass-pill text-[#bbb] hover:text-white',
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}

function StatsBar({
  loading,
  strong,
  good,
  stretch,
}: {
  loading: boolean
  strong: number
  good: number
  stretch: number
}) {
  if (loading) {
    return (
      <section className="glass-card flex items-center justify-around gap-4 rounded-2xl border border-white/[0.06] p-4">
        <Skeleton className="h-6 w-24" />
        <span className="h-6 w-px bg-[#1f1f1f]" />
        <Skeleton className="h-6 w-24" />
        <span className="h-6 w-px bg-[#1f1f1f]" />
        <Skeleton className="h-6 w-24" />
      </section>
    )
  }
  return (
    <section className="glass-card flex flex-wrap items-center justify-around gap-3 rounded-2xl border border-white/[0.06] p-4">
      <StatItem value={strong} label="Strong Fits" color="#22c55e" />
      <span aria-hidden className="h-6 w-px bg-[#1f1f1f]" />
      <StatItem value={good} label="Good Fits" color="#FF6733" />
      <span aria-hidden className="h-6 w-px bg-[#1f1f1f]" />
      <StatItem value={stretch} label="Stretch" color="#888" />
    </section>
  )
}

function StatItem({
  value,
  label,
  color,
}: {
  value: number
  label: string
  color: string
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span
        className="font-headline text-2xl font-medium tracking-tight"
        style={{ color }}
      >
        {value}
      </span>
      <span
        className="font-label text-[11px] uppercase tracking-[0.18em]"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  )
}

function SelectionStrip({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
}: {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
}) {
  const allSelected = selectedCount > 0 && selectedCount === totalCount
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="font-body text-xs">
        <span className="text-[#FF6733]">{selectedCount}</span>{' '}
        <span className="text-[#888]">
          {selectedCount === 1 ? 'job selected' : 'jobs selected'}
        </span>
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSelectAll}
          disabled={allSelected || totalCount === 0}
          className="font-label text-xs text-[#666] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-[#666]"
        >
          Select all
        </button>
        <span aria-hidden className="h-3 w-px bg-[#1f1f1f]" />
        <button
          type="button"
          onClick={onDeselectAll}
          disabled={selectedCount === 0}
          className="font-label text-xs text-[#666] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-[#666]"
        >
          Deselect all
        </button>
      </div>
    </div>
  )
}

function KanbanBoard({
  loading,
  strongJobs,
  goodJobs,
  stretchJobs,
  selectedJobIds,
  onToggleSelect,
  onSelectColumn,
  onDeselectColumn,
  resumeId,
  isPro,
  tailoredJobIds,
  onVariantCached,
}: {
  loading: boolean
  strongJobs: JobMatch[]
  goodJobs: JobMatch[]
  stretchJobs: JobMatch[]
  selectedJobIds: Set<string>
  onToggleSelect: (jobId: string) => void
  onSelectColumn: (jobs: JobMatch[]) => void
  onDeselectColumn: (jobs: JobMatch[]) => void
  resumeId: string | null
  isPro: boolean
  tailoredJobIds: Set<string>
  onVariantCached: (jobId: string) => void
}) {
  const tailoringProps = {
    resumeId,
    isPro,
    tailoredJobIds,
    onVariantCached,
  }
  return (
    <>
      <div className="hidden gap-6 md:grid md:grid-cols-3">
        <JobColumn
          title="Strong Fit"
          color="#22c55e"
          count={strongJobs.length}
          jobs={strongJobs}
          selectedJobIds={selectedJobIds}
          onToggleSelect={onToggleSelect}
          onSelectAllInColumn={() => onSelectColumn(strongJobs)}
          onDeselectAllInColumn={() => onDeselectColumn(strongJobs)}
          loading={loading}
          {...tailoringProps}
        />
        <JobColumn
          title="Good Fit"
          color="#FF6733"
          count={goodJobs.length}
          jobs={goodJobs}
          selectedJobIds={selectedJobIds}
          onToggleSelect={onToggleSelect}
          onSelectAllInColumn={() => onSelectColumn(goodJobs)}
          onDeselectAllInColumn={() => onDeselectColumn(goodJobs)}
          loading={loading}
          {...tailoringProps}
        />
        <JobColumn
          title="Stretch"
          color="#888888"
          count={stretchJobs.length}
          jobs={stretchJobs}
          selectedJobIds={selectedJobIds}
          onToggleSelect={onToggleSelect}
          onSelectAllInColumn={() => onSelectColumn(stretchJobs)}
          onDeselectAllInColumn={() => onDeselectColumn(stretchJobs)}
          loading={loading}
          {...tailoringProps}
        />
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        <MobileSection
          title="Strong Fit"
          color="#22c55e"
          jobs={strongJobs}
          selectedJobIds={selectedJobIds}
          onToggleSelect={onToggleSelect}
          onSelectAllInColumn={() => onSelectColumn(strongJobs)}
          onDeselectAllInColumn={() => onDeselectColumn(strongJobs)}
          loading={loading}
          defaultOpen
          {...tailoringProps}
        />
        <MobileSection
          title="Good Fit"
          color="#FF6733"
          jobs={goodJobs}
          selectedJobIds={selectedJobIds}
          onToggleSelect={onToggleSelect}
          onSelectAllInColumn={() => onSelectColumn(goodJobs)}
          onDeselectAllInColumn={() => onDeselectColumn(goodJobs)}
          loading={loading}
          {...tailoringProps}
        />
        <MobileSection
          title="Stretch"
          color="#888888"
          jobs={stretchJobs}
          selectedJobIds={selectedJobIds}
          onToggleSelect={onToggleSelect}
          onSelectAllInColumn={() => onSelectColumn(stretchJobs)}
          onDeselectAllInColumn={() => onDeselectColumn(stretchJobs)}
          loading={loading}
          {...tailoringProps}
        />
      </div>
    </>
  )
}

function MobileSection({
  title,
  color,
  jobs,
  selectedJobIds,
  onToggleSelect,
  onSelectAllInColumn,
  onDeselectAllInColumn,
  loading,
  defaultOpen = false,
  resumeId,
  isPro,
  tailoredJobIds,
  onVariantCached,
}: {
  title: string
  color: string
  jobs: JobMatch[]
  selectedJobIds: Set<string>
  onToggleSelect: (jobId: string) => void
  onSelectAllInColumn: () => void
  onDeselectAllInColumn: () => void
  loading: boolean
  defaultOpen?: boolean
  resumeId: string | null
  isPro: boolean
  tailoredJobIds: Set<string>
  onVariantCached: (jobId: string) => void
}) {
  const jobIds = jobs.map((j) => j.id)

  return (
    <details
      open={defaultOpen}
      className="glass-card group rounded-2xl border border-white/[0.06] p-4"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#888]">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="glass-pill rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-[#888]">
            {jobs.length}
          </span>
          <ChevronDown
            className="h-4 w-4 text-[#666] transition-transform group-open:rotate-180"
            strokeWidth={2}
          />
        </div>
      </summary>

      {!loading && jobs.length > 0 ? (
        <ColumnSelectActions
          jobIds={jobIds}
          selectedJobIds={selectedJobIds}
          onSelectAll={onSelectAllInColumn}
          onDeselectAll={onDeselectAllInColumn}
          className="mt-3"
        />
      ) : null}

      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-6 text-center font-body text-sm italic text-[#444]">
            No {title.toLowerCase()} matches yet
          </p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={selectedJobIds.has(job.id)}
                onToggleSelect={onToggleSelect}
                resumeId={resumeId}
                isPro={isPro}
                hasTailoredVariant={tailoredJobIds.has(job.id)}
                onVariantCached={onVariantCached}
              />
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

function NoResumeState() {
  return (
    <section className="glass-card flex flex-col items-center gap-4 rounded-2xl border border-white/[0.06] p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6733]/10">
        <FileText className="h-6 w-6 text-[#FF6733]" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <h2 className="font-headline text-xl font-medium text-white">
          Analyze your resume first
        </h2>
        <p className="font-body text-sm text-[#888]">
          Scout needs to understand your background before finding your matches.
        </p>
      </div>
      <Link
        href={`/dashboard#${RESUME_UPLOAD_SECTION_ID}`}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-6 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_32px_rgba(255,103,51,0.55)] active:scale-[0.97]"
      >
        Upload Resume →
      </Link>
    </section>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <section className="glass-card flex flex-col items-center gap-4 rounded-2xl border border-white/[0.06] p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ef4444]/10">
        <AlertCircle className="h-6 w-6 text-[#ef4444]" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <h2 className="font-headline text-xl font-medium text-white">
          Something went wrong
        </h2>
        <p className="font-body text-sm text-[#888]">
          {message || 'We could not load your matches. Please try again.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-6 font-label text-sm font-semibold text-[#bbb] transition-colors hover:border-[#FF6733]/40 hover:bg-[#FF6733]/[0.06] hover:text-white"
      >
        <RefreshCw className="h-4 w-4" strokeWidth={2} />
        Try again
      </button>
    </section>
  )
}
