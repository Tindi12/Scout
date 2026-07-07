'use client'

import { Check, ChevronDown, ExternalLink, MapPin, Sparkles } from 'lucide-react'
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useState,
} from 'react'

import { JobCardTailoredPanel } from '@/components/jobs/JobCardTailoredPanel'
import { cn } from '@/lib/utils'

export type JobMatch = {
  id: string
  title: string
  company: string
  location: string
  remote: boolean
  skills_required: string[]
  url: string
  portal: string
  visa_sponsorship: string
  final_score: number
  category: string
  matched_skills: string[]
  description?: string
}

export interface JobCardProps {
  job: JobMatch
  selected: boolean
  onToggleSelect: (jobId: string) => void
  resumeId: string | null
  isPro: boolean
  hasTailoredVariant?: boolean
  onVariantCached?: (jobId: string) => void
}

function scorePillClasses(category: string): string {
  switch (category) {
    case 'STRONG_FIT':
      return 'bg-[#22c55e]/10 text-[#22c55e]'
    case 'GOOD_FIT':
      return 'bg-primary/10 text-[#FF6733]'
    case 'STRETCH':
    default:
      return 'bg-white/5 text-[#888]'
  }
}

type PortalMeta = { label: string; classes: string }

function portalMeta(portal: string): PortalMeta {
  const value = (portal ?? '').toLowerCase()
  if (value === 'greenhouse') {
    return { label: 'Greenhouse', classes: 'bg-[#22c55e]/10 text-[#22c55e]' }
  }
  if (value === 'lever') {
    return { label: 'Lever', classes: 'bg-[#3b82f6]/10 text-[#3b82f6]' }
  }
  if (value === 'ashby') {
    return { label: 'Ashby', classes: 'bg-purple-500/10 text-purple-400' }
  }
  if (value === 'workday') {
    return { label: 'Workday', classes: 'bg-blue-500/10 text-blue-400' }
  }
  if (value === 'usajobs') {
    return { label: 'USAJobs', classes: 'bg-amber-500/10 text-amber-400' }
  }
  if (value === 'jsearch') {
    return { label: 'JSearch', classes: 'bg-indigo-500/10 text-indigo-400' }
  }
  if (value === 'muse') {
    return { label: 'The Muse', classes: 'bg-pink-500/10 text-pink-400' }
  }
  return { label: 'Direct', classes: 'bg-white/5 text-[#888]' }
}

function parseLocations(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function JobCard({
  job,
  selected,
  onToggleSelect,
  resumeId,
  isPro,
  hasTailoredVariant = false,
  onVariantCached,
}: JobCardProps) {
  const [expanded, setExpanded] = useState(false)

  const score = Math.max(0, Math.min(100, Math.round(job.final_score)))
  const scoreClasses = scorePillClasses(job.category)
  const portal = portalMeta(job.portal)

  const hasMatched = job.matched_skills.length > 0
  const pillSource = hasMatched ? job.matched_skills : job.skills_required
  const visiblePills = pillSource.slice(0, 3)
  const extraPillCount = pillSource.length - visiblePills.length
  const pillTone = hasMatched
    ? 'bg-primary/10 text-[#FF6733]'
    : 'bg-white/5 text-[#888]'

  const showVisa = job.visa_sponsorship !== 'unknown'
  const visaPositive = job.visa_sponsorship === 'yes'
  const visaClearance = job.visa_sponsorship === 'clearance'

  const companyLabel = (job.company ?? '').trim() || 'Unknown'
  const locationList = parseLocations(job.location ?? '')
  const primaryLocation = locationList[0] ?? 'Location TBD'
  const extraLocationCount = Math.max(0, locationList.length - 1)
  const allLocationsLabel = locationList.join(', ')
  const hasDescription = Boolean((job.description ?? '').trim())

  const handleExpandToggle = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleSelectToggle = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation()
      onToggleSelect(job.id)
    },
    [job.id, onToggleSelect],
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleExpandToggle()
    }
  }

  const stopBubble = (event: MouseEvent) => {
    event.stopPropagation()
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={handleExpandToggle}
      onKeyDown={handleKeyDown}
      className={cn(
        'group glass-card relative cursor-pointer overflow-hidden rounded-2xl border p-4 transition-all duration-200 focus:outline-none focus-visible:border-[#FF6733]/60 focus-visible:ring-2 focus-visible:ring-[#FF6733]/40',
        selected
          ? 'border-[#FF6733]/60 bg-primary/[0.04]'
          : 'border-white/[0.06] hover:border-white/10',
        expanded && 'border-white/12',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate font-mono text-xs uppercase tracking-wider text-[#888]">
          {companyLabel}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {hasTailoredVariant ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-label text-[9px] font-semibold uppercase tracking-wider text-[#FF6733]">
              <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
              Tailored
            </span>
          ) : null}
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wider',
              scoreClasses,
            )}
          >
            {score}% match
          </span>
          <button
            type="button"
            aria-label={selected ? 'Deselect job' : 'Select job'}
            aria-pressed={selected}
            onClick={handleSelectToggle}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'border border-white/20 text-transparent group-hover:border-white/30 group-hover:text-[#888]',
            )}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
          </button>
        </div>
      </div>

      <h3 className="mt-2 break-words font-headline text-[16px] font-medium leading-snug text-white">
        {job.title || 'Untitled role'}
      </h3>

      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[#666]">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0 text-[#666]" strokeWidth={2} />
          <span className="min-w-0 flex-shrink truncate">
            {primaryLocation}
          </span>
          {extraLocationCount > 0 ? (
            <span
              title={allLocationsLabel}
              onClick={stopBubble}
              className="shrink-0 cursor-help rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-[#FF6733]"
            >
              +{extraLocationCount} more
            </span>
          ) : null}
        </span>
        {job.remote ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-medium text-[#22c55e]">
            Remote
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {visiblePills.map((skill) => (
          <span
            key={skill}
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px]',
              pillTone,
            )}
          >
            {skill}
          </span>
        ))}
        {extraPillCount > 0 ? (
          <span className="text-[10px] text-[#555]">
            +{extraPillCount} more
          </span>
        ) : null}
        {visiblePills.length === 0 ? (
          <span className="text-[10px] italic text-[#444]">
            No listed skills
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            portal.classes,
          )}
        >
          <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} />
          {portal.label}
        </span>
        {showVisa ? (
          <span
            className={cn(
              'text-[10px]',
              visaPositive
                ? 'text-[#22c55e]'
                : visaClearance
                  ? 'text-[#f59e0b]'
                  : 'text-[#ef4444]',
            )}
          >
            {visaPositive
              ? '✓ Sponsors visas'
              : visaClearance
                ? '⚠ Some roles need US citizenship'
                : '✗ No sponsorship'}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <a
          href={job.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stopBubble}
          className="font-label text-xs text-[#666] transition-colors hover:text-white"
        >
          View job →
        </a>
        <span
          className="inline-flex items-center gap-1 font-label text-[10px] uppercase tracking-wider text-[#666]"
          aria-hidden
        >
          {expanded ? 'Hide resume' : 'Tailored resume'}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-200',
              expanded && 'rotate-180',
            )}
            strokeWidth={2}
          />
        </span>
      </div>

      <JobCardTailoredPanel
        expanded={expanded}
        jobId={job.id}
        company={companyLabel}
        resumeId={resumeId}
        isPro={isPro}
        hasDescription={hasDescription}
        onCached={() => onVariantCached?.(job.id)}
      />
    </article>
  )
}
