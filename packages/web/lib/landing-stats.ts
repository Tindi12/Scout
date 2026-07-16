import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

/** Shown in international students section (rounded marketing figure). */
export const LANDING_CPT_OPT_EMPLOYER_COUNT = 900

export const LANDING_HERO_PILL = {
  databaseLine: '5,000+ internships in our database',
  internationalLine: 'CPT/OPT friendly',
} as const

/** Average minutes to manually complete one internship application. */
export const MANUAL_MINUTES_PER_APPLICATION = 35

/** Seeded launch baselines — historical beta/testing activity (never start at 0). */
export const STAT_SEEDS = {
  applicationsAutomated: 88,
  resumesOptimized: 35,
  hoursSaved: 53,
} as const

/** Launch pacing caps — ignored once real totals exceed them. */
export const STAT_LAUNCH_CAPS = {
  applicationsAutomated: 250,
  hoursSaved: 200,
} as const

/**
 * Pace a live total for landing display:
 * - never below the launch seed
 * - while under the launch cap, chase the real (floored) total
 * - once real activity exceeds the cap, follow the real total with no ceiling
 */
export function paceMetric(
  real: number,
  baseline: number,
  launchCap?: number,
): number {
  const safe = Math.max(0, Math.round(real))
  const floored = Math.max(baseline, safe)
  if (launchCap == null) return floored
  if (safe > launchCap) return safe
  return Math.min(floored, launchCap)
}

export function computeHoursSaved(completedApplications: number): number {
  const minutes =
    Math.max(0, Math.round(completedApplications)) *
    MANUAL_MINUTES_PER_APPLICATION
  return Math.floor(minutes / 60)
}

export type PlatformStats = {
  /** Paced applications-automated target for the live counter. */
  applicationsAutomated: number
  /** Paced resumes-optimized target for the live counter. */
  resumesOptimized: number
  /** Paced hours-saved target for the live counter. */
  hoursSaved: number
}

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const admin = getAdminClient()

  let liveApplied = 0
  let liveResumes = 0

  if (admin) {
    const [appliedRes, optimizedRes] = await Promise.all([
      admin
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'applied'),
      admin
        .from('analyses')
        .select('id', { count: 'exact', head: true })
        .not('rewritten_resume', 'is', null),
    ])
    liveApplied = typeof appliedRes.count === 'number' ? appliedRes.count : 0
    liveResumes = typeof optimizedRes.count === 'number' ? optimizedRes.count : 0
  }

  const applicationsAutomated = paceMetric(
    liveApplied,
    STAT_SEEDS.applicationsAutomated,
    STAT_LAUNCH_CAPS.applicationsAutomated,
  )

  const resumesOptimized = paceMetric(
    liveResumes,
    STAT_SEEDS.resumesOptimized,
  )

  // Hours track completed applications (seed-floored), then get their own pace/cap.
  const appsForHours = Math.max(
    STAT_SEEDS.applicationsAutomated,
    liveApplied,
  )
  const hoursSaved = paceMetric(
    computeHoursSaved(appsForHours),
    STAT_SEEDS.hoursSaved,
    STAT_LAUNCH_CAPS.hoursSaved,
  )

  return {
    applicationsAutomated,
    resumesOptimized,
    hoursSaved,
  }
}

/**
 * Platform-wide marketing metrics for the landing page.
 * Cached 30s so counters can refresh while visitors stay on the page.
 */
export const getPlatformStats = unstable_cache(
  fetchPlatformStats,
  ['landing-platform-stats-v3'],
  { revalidate: 30 },
)
