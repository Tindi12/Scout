'use client'

import {
  AlertCircle,
  Briefcase,
  ChevronDown,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { JobCard, type JobMatch } from '@/components/jobs/JobCard'
import { ColumnSelectActions, JobColumn } from '@/components/jobs/JobColumn'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
import { ProUpgradeDialog } from '@/components/ProUpgradeDialog'
import { ProfileRequiredDialog } from '@/components/profile/ProfileRequiredDialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useExploreBatch } from '@/contexts/explore-batch-context'
import { cn } from '@/lib/utils'
import { RESUME_UPLOAD_SECTION_ID } from '@/lib/scroll-to-resume-upload'
import {
  computeProfileCompletion,
  type ProfileData,
} from '@/lib/profile-completion'
import {
  isPaidUser,
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

const UNITED_STATES_LABEL = 'United States'

// prettier-ignore
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC', 'PR',
])

// prettier-ignore
const US_STATE_NAMES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
  'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
  'washington', 'west virginia', 'wisconsin', 'wyoming',
  'district of columbia', 'puerto rico',
])

const US_MARKERS = new Set(['US', 'USA', 'UNITED STATES', 'US REMOTE', 'REMOTE US'])

/**
 * Job locations rarely say "United States" literally ("San Francisco, CA",
 * "Remote - US", "Boston, MA, US"), so the pinned suggestion matches on
 * state codes, state names, and US/USA markers instead of raw substrings.
 */
function isUsLocation(location: string): boolean {
  if (!location) return false
  if (location.toLowerCase().includes('united states')) return true
  for (const segment of location.split(/[;|,/]|\s[-–]\s/)) {
    const part = segment.trim().replace(/\./g, '')
    if (!part) continue
    if (US_MARKERS.has(part.toUpperCase())) return true
    if (part.length === 2 && US_STATE_CODES.has(part.toUpperCase())) return true
    if (US_STATE_NAMES.has(part.toLowerCase())) return true
  }
  return false
}

function jobMatchesLocation(job: JobMatch, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (q === 'united states' || q === 'usa' || q === 'us') {
    return isUsLocation(job.location)
  }
  return (job.location ?? '').toLowerCase().includes(q)
}

/** One suggestion row for a filter search input. */
type SearchSuggestion = {
  label: string
  /** Lowercase haystack the typed query is matched against (label + aliases). */
  searchText: string
  hint?: string
}

/**
 * The engineering disciplines Scout supports (mirrors the onboarding role
 * grid). Suggestions seed the search box — the actual matching happens
 * server-side in /jobs/search against the whole jobs database.
 */
const ROLE_SUGGESTION_SOURCE: ReadonlyArray<{ label: string; aliases: string[] }> = [
  {
    label: 'Software Engineering',
    aliases: ['swe', 'software', 'software engineer', 'cs', 'sde', 'dev', 'developer'],
  },
  { label: 'Machine Learning', aliases: ['ml', 'ai', 'artificial intelligence', 'data science'] },
  { label: 'Chemical Engineering', aliases: ['chem', 'chem eng', 'cheme', 'chemical'] },
  { label: 'Mechanical Engineering', aliases: ['mech', 'mech eng', 'me', 'mechanical'] },
  { label: 'Electrical Engineering', aliases: ['ee', 'ece', 'elec', 'electrical'] },
  { label: 'Civil Engineering', aliases: ['civil', 'ce'] },
  { label: 'Aerospace Engineering', aliases: ['aero', 'aerospace'] },
  { label: 'Environmental Engineering', aliases: ['enviro', 'environmental'] },
  { label: 'Nuclear Engineering', aliases: ['nuclear'] },
  { label: 'Biomedical Engineering', aliases: ['bme', 'bio', 'biomed', 'biomedical'] },
  { label: 'Industrial Engineering', aliases: ['ie', 'industrial'] },
  { label: 'Research', aliases: ['research', 'researcher', 'r&d'] },
]

const ROLE_SUGGESTIONS: SearchSuggestion[] = ROLE_SUGGESTION_SOURCE.map((o) => ({
  label: o.label,
  searchText: `${o.label} ${o.aliases.join(' ')}`.toLowerCase(),
}))

const SEARCH_DEBOUNCE_MS = 400

export default function ExplorePage() {
  const { toast } = useToast()
  const { setBatch, requestPulse, credits } = useExploreBatch()
  const router = useRouter()

  const [user, setUser] = useState<UserSummary | null>(null)
  const [userLoaded, setUserLoaded] = useState(false)

  const [status, setStatus] = useState<PageStatus>('loading')
  const [jobs, setJobs] = useState<JobMatch[]>([])
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [roleFilter, setRoleFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Server-side role search over the whole jobs DB. null = no active search
  // (the board shows the user's recommended matches).
  const [searchResults, setSearchResults] = useState<JobMatch[] | null>(null)
  const [searching, setSearching] = useState(false)
  const searchSeqRef = useRef(0)

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
  const [isSending, setIsSending] = useState(false)

  const hasPulsedRef = useRef(false)
  const autoSelectedKeyRef = useRef<string | null>(null)

  // 1. Load the Scout user row (need subscription_plan + supabase id).
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
          subscription_plan?: string | null
          profile?: Partial<ProfileData> | null
          profile_complete?: boolean | null
        }
        const plan = normalizeSubscriptionPlan(body.subscription_plan)
        const completion = computeProfileCompletion(body.profile ?? undefined)
        setUser({
          id: body.id ?? null,
          isPro: isPaidUser(plan),
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
          (detail.toLowerCase().includes('resume') ||
            detail.toLowerCase().includes('analysis'))
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

  // Debounced role search against the whole jobs database. Clearing the box
  // drops straight back to the recommended matches.
  useEffect(() => {
    const query = roleFilter.trim()
    if (!query) {
      searchSeqRef.current += 1
      setSearchResults(null)
      setSearching(false)
      return
    }

    const seq = ++searchSeqRef.current
    setSearching(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch('/api/jobs/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: 50 }),
            cache: 'no-store',
          })
          if (searchSeqRef.current !== seq) return
          if (!res.ok) {
            setSearchResults([])
            return
          }
          const data = (await res.json()) as JobMatch[]
          const list = Array.isArray(data) ? data : []
          list.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))
          setSearchResults(list)
        } catch {
          if (searchSeqRef.current === seq) setSearchResults([])
        } finally {
          if (searchSeqRef.current === seq) setSearching(false)
        }
      })()
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [roleFilter])

  // What the board is currently built from: search results when a role
  // search is active, otherwise the user's recommended matches.
  const activeJobs = searchResults ?? jobs

  // Smart location suggestions: unique locations from whatever the board is
  // showing (search results or recommended matches), ranked by how often
  // they appear, with United States always pinned first.
  const locationSuggestions = useMemo<SearchSuggestion[]>(() => {
    const counts = new Map<string, { label: string; count: number }>()
    for (const job of activeJobs) {
      for (const segment of (job.location ?? '').split(/[;|]/)) {
        const label = segment.trim()
        if (!label) continue
        const key = label.toLowerCase()
        if (key === 'united states' || key === 'usa' || key === 'us') continue
        const entry = counts.get(key)
        if (entry) entry.count += 1
        else counts.set(key, { label, count: 1 })
      }
    }
    const ranked = [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .map((entry) => ({
        label: entry.label,
        searchText: entry.label.toLowerCase(),
      }))
    return [
      {
        label: UNITED_STATES_LABEL,
        searchText: 'united states usa us',
        hint: 'All US roles',
      },
      ...ranked.slice(0, 11),
    ]
  }, [activeJobs])

  // Location + chips narrow the active set (search results or matches);
  // the role search itself already decided what that set is.
  const filteredJobs = useMemo(() => {
    let list = activeJobs
    if (filter === 'remote') list = list.filter((j) => j.remote === true)
    else if (filter === 'visa') {
      list = list.filter((j) => j.visa_sponsorship === 'yes')
    }
    if (locationFilter.trim()) {
      list = list.filter((j) => jobMatchesLocation(j, locationFilter))
    }
    return list
  }, [activeJobs, filter, locationFilter])

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

  // Every job the user has seen this session (matches + all search results),
  // so selections survive switching between searches and the match view.
  const [jobCatalog, setJobCatalog] = useState<Map<string, JobMatch>>(
    () => new Map(),
  )
  useEffect(() => {
    setJobCatalog((prev) => {
      const next = new Map(prev)
      for (const job of jobs) next.set(job.id, job)
      for (const job of searchResults ?? []) next.set(job.id, job)
      return next
    })
  }, [jobs, searchResults])

  const selectedJobs = useMemo(
    () =>
      [...selectedJobIds]
        .map((id) => jobCatalog.get(id))
        .filter((j): j is JobMatch => Boolean(j)),
    [selectedJobIds, jobCatalog],
  )

  const handleConfirmBatch = useCallback(() => {
    if (selectedJobs.length === 0) {
      setShowBatchConfirm(false)
      return
    }
    const remaining = credits?.remaining ?? 0
    if (selectedJobs.length > remaining) return

    const jobIds = selectedJobs.map((j) => j.id)
    void (async () => {
      setIsSending(true)
      try {
        const res = await fetch('/api/scout/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_ids: jobIds }),
        })
        if (!res.ok) {
          let message = 'Could not start Scout run.'
          try {
            const body = (await res.json()) as { detail?: string }
            if (typeof body.detail === 'string') message = body.detail
          } catch { /* ignore */ }
          toast({
            title: 'Failed to send Scout',
            description: message,
            variant: 'destructive',
          })
          setShowBatchConfirm(false)
          return
        }
        const data = (await res.json()) as { scout_run_id?: string }
        setShowBatchConfirm(false)
        if (data.scout_run_id) {
          track(ANALYTICS_EVENTS.SCOUT_RUN_STARTED, {
            job_count: jobIds.length,
          })
          router.push(`/tracker?run_id=${encodeURIComponent(data.scout_run_id)}`)
        }
      } finally {
        setIsSending(false)
      }
    })()
  }, [selectedJobs, credits?.remaining, toast, router])

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

  // Funnel step: a meaningful Explore view (jobs actually loaded). Fire once per mount.
  const hasTrackedJobsViewRef = useRef(false)
  useEffect(() => {
    if (status !== 'loaded' || hasTrackedJobsViewRef.current) return
    hasTrackedJobsViewRef.current = true
    track(ANALYTICS_EVENTS.JOBS_VIEWED, { job_count: jobs.length })
  }, [status, jobs.length])

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
          role={roleFilter}
          onRoleChange={setRoleFilter}
          searching={searching}
          location={locationFilter}
          onLocationChange={setLocationFilter}
          locationSuggestions={locationSuggestions}
        />

        {searchResults !== null && !searching ? (
          <p className="-mt-2 px-1 font-body text-xs text-[#666]">
            {searchResults.length === 0
              ? `No internships in our database matched “${roleFilter.trim()}” — try a broader term.`
              : `${searchResults.length} ${
                  searchResults.length === 1 ? 'internship' : 'internships'
                } from across our database for “${roleFilter.trim()}” — clear the search to see your recommended matches.`}
          </p>
        ) : null}

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
          </DialogHeader>

          {/* Info rows */}
          <div className="flex flex-col gap-2.5">
            {/* Row 1 — volume */}
            <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Briefcase className="h-4 w-4 text-[#FF6733]" strokeWidth={1.75} />
              </div>
              <div>
                <p className="font-label text-sm font-medium text-white">
                  {selectedCount}{' '}
                  {selectedCount === 1 ? 'application' : 'applications'} will be submitted
                </p>
                <p className="font-body text-xs text-[#666]">
                  Scout applies autonomously while you study
                </p>
              </div>
            </div>

            {/* Row 2 — resume */}
            <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-[#FF6733]" strokeWidth={1.75} />
              </div>
              <div>
                <p className="font-label text-sm font-medium text-white">
                  Using your optimized resume
                </p>
                <p className="font-body text-xs text-[#666]">
                  Tailored per job where available
                </p>
              </div>
            </div>

            {/* Row 3 — credits + bar */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <CreditCard className="h-4 w-4 text-[#FF6733]" strokeWidth={1.75} />
                </div>
                <p className="font-label text-sm font-medium text-white">
                  Using {selectedCount} of your{' '}
                  {creditsRemaining != null ? creditsRemaining : '—'}{' '}
                  remaining {creditsRemaining === 1 ? 'application' : 'applications'}
                </p>
              </div>

              {creditsRemaining != null && creditsRemaining > 0 && (
                <>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{
                        width: `${Math.min((selectedCount / creditsRemaining) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="font-body text-[11px] text-[#555]">
                    {Math.max(creditsRemaining - selectedCount, 0)} remaining after this run
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Over-limit warning */}
          {creditsRemaining != null && selectedCount > creditsRemaining && (
            <div className="flex items-start gap-2 rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/[0.06] p-3">
              <AlertCircle
                className="h-4 w-4 shrink-0 text-[#ef4444]"
                strokeWidth={2}
              />
              <p className="font-body text-xs text-[#ef4444]">
                You don&apos;t have enough credits. Select fewer jobs or upgrade your plan.
              </p>
            </div>
          )}

          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowBatchConfirm(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmBatch}
              disabled={
                isSending ||
                selectedCount === 0 ||
                (creditsRemaining != null && selectedCount > creditsRemaining)
              }
              loading={isSending}
            >
              {isSending ? 'Sending Scout…' : 'Send Scout →'}
            </Button>
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
  role,
  onRoleChange,
  searching,
  location,
  onLocationChange,
  locationSuggestions,
}: {
  loading: boolean
  onRefresh: () => void
  filter: FilterKey
  onFilterChange: (key: FilterKey) => void
  role: string
  onRoleChange: (value: string) => void
  searching: boolean
  location: string
  onLocationChange: (value: string) => void
  locationSuggestions: SearchSuggestion[]
}) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
            Explore
          </h1>
          <p className="mt-1 font-body text-sm text-[#888]">
            Jobs matched to your resume
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
            strokeWidth={2}
          />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <FilterSearchInput
          icon={Search}
          value={role}
          onChange={onRoleChange}
          suggestions={ROLE_SUGGESTIONS}
          placeholder="Search all internships — SWE, chem eng, EE…"
          ariaLabel="Search internships by role"
          loading={searching}
          className="lg:max-w-sm lg:flex-1"
        />
        <FilterSearchInput
          icon={MapPin}
          value={location}
          onChange={onLocationChange}
          suggestions={locationSuggestions}
          placeholder="Filter by location"
          ariaLabel="Filter by location"
          className="lg:w-56"
        />
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 lg:ml-auto">
          {FILTERS.map((f) => {
            const active = f.key === filter
            return (
              <Button
                key={f.key}
                type="button"
                variant="chip"
                size="sm"
                data-state={active ? 'selected' : undefined}
                onClick={() => onFilterChange(f.key)}
                className="shrink-0"
              >
                {f.label}
              </Button>
            )
          })}
        </div>
      </div>
    </header>
  )
}

/**
 * Text filter with a suggestion dropdown, styled to match the Button system
 * (rounded-md, white/15 border). Typing filters the board live; suggestions
 * are shortcuts, not required.
 */
function FilterSearchInput({
  icon: Icon,
  value,
  onChange,
  suggestions,
  placeholder,
  ariaLabel,
  loading = false,
  className,
}: {
  icon: typeof Search
  value: string
  onChange: (value: string) => void
  suggestions: SearchSuggestion[]
  placeholder: string
  ariaLabel: string
  loading?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(event: globalThis.MouseEvent) {
      const target = event.target as Node | null
      if (!containerRef.current || !target) return
      if (!containerRef.current.contains(target)) setOpen(false)
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const query = value.trim().toLowerCase()
  const visibleSuggestions = suggestions.filter(
    (s) =>
      s.label.toLowerCase() !== query &&
      (!query || s.searchText.includes(query)),
  )

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {loading ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        >
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-[#FF6733]"
            strokeWidth={2}
          />
        </span>
      ) : (
        <Icon
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#666]"
          strokeWidth={2}
        />
      )}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        className="font-body h-8 w-full rounded-md border border-white/15 bg-transparent pl-8 pr-8 text-sm text-foreground transition-colors duration-150 placeholder:text-[#666] hover:border-white/25 focus:border-white/25 focus:bg-white/[0.05] focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          onClick={() => {
            onChange('')
            setOpen(false)
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[#666] transition-colors hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}

      {open && visibleSuggestions.length > 0 ? (
        <div
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
          className="glass-card absolute left-0 top-full z-20 mt-2 max-h-72 w-full min-w-56 overflow-y-auto rounded-xl border border-white/[0.08] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          {visibleSuggestions.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onChange(suggestion.label)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left font-body text-sm text-[#bdbdbd] transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <Icon
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-[#555]"
                strokeWidth={2}
              />
              <span className="truncate">{suggestion.label}</span>
              {suggestion.hint ? (
                <span className="ml-auto shrink-0 font-label text-[10px] uppercase tracking-[0.16em] text-[#666]">
                  {suggestion.hint}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
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
      <Button asChild size="lg">
        <Link href={`/dashboard#${RESUME_UPLOAD_SECTION_ID}`}>Upload Resume →</Link>
      </Button>
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
      <Button type="button" size="lg" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" strokeWidth={2} />
        Try again
      </Button>
    </section>
  )
}
