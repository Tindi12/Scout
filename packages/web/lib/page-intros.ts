import type { MascotPose } from '@/lib/mascot'

/**
 * Scalable keys stored in users.seen_page_intros jsonb.
 * Keep keys snake_case and stable — renaming requires a data migration.
 */
export const PAGE_INTRO_KEYS = {
  RESUME_ANALYSIS: 'resume_analysis',
  EXPLORE: 'explore',
  TRACKER: 'tracker',
  COPILOT: 'copilot',
  SETTINGS: 'settings',
  ANALYTICS: 'analytics',
  PRICING: 'pricing',
  WELCOME: 'welcome',
  FIRST_SCOUT_RUN: 'first_scout_run',
} as const

export type PageIntroKey =
  (typeof PAGE_INTRO_KEYS)[keyof typeof PAGE_INTRO_KEYS]

export const PAGE_INTRO_KEY_SET = new Set<string>(
  Object.values(PAGE_INTRO_KEYS),
)

export function isPageIntroKey(value: string): value is PageIntroKey {
  return PAGE_INTRO_KEY_SET.has(value)
}

export type PageIntroDef = {
  key: PageIntroKey
  /** Match a pathname. Prefer exclusive prefixes. */
  match: (pathname: string) => boolean
  pose: MascotPose
  title: string
  message: string
  placement?: 'bottom-left' | 'bottom-right' | 'peek-right'
  /** Extra class for dashboard-safe left inset, etc. */
  className?: string
  dismissLabel?: string
  ctaLabel?: string
  ctaHref?: string
  /** When true, generic intro is skipped (e.g. tracker during live run). */
  suppressWhenActiveRun?: boolean
  /** Paths allowed outside the dashboard shell. */
  outsideDashboardShell?: boolean
}

/**
 * Contextual one-time intros. Order only matters when two defs match the
 * same path — prefer specific matches first.
 */
export const PAGE_INTROS: readonly PageIntroDef[] = [
  {
    key: PAGE_INTRO_KEYS.RESUME_ANALYSIS,
    match: (p) => p.startsWith('/resume/analysis'),
    pose: 'point',
    placement: 'bottom-right',
    className: undefined,
    title: 'Your Scout Score',
    message:
      'This is your Scout Score. Hit the biggest gaps first, then use Refactor for a Jake-format rewrite ready to send.',
    dismissLabel: 'Got it',
  },
  {
    key: PAGE_INTRO_KEYS.EXPLORE,
    match: (p) => p === '/explore' || p.startsWith('/explore/'),
    pose: 'point',
    placement: 'peek-right',
    title: 'Matched jobs',
    message:
      "Jobs are ranked against your resume. Pick a few strong fits, then hit Send Scout and I'll handle the forms.",
    dismissLabel: 'Got it',
  },
  {
    key: PAGE_INTRO_KEYS.TRACKER,
    match: (p) => p === '/tracker' || p.startsWith('/tracker/'),
    pose: 'wave',
    placement: 'bottom-right',
    className: undefined,
    title: 'Mission control',
    message:
      'Every application lives here: submitted, moving, or needing you. Open a card whenever Scout hits a blocker.',
    dismissLabel: 'Got it',
    suppressWhenActiveRun: true,
  },
  {
    key: PAGE_INTRO_KEYS.COPILOT,
    match: (p) => p === '/copilot' || p.startsWith('/copilot/'),
    pose: 'wave',
    placement: 'bottom-right',
    className: undefined,
    title: 'Ask Scout',
    message:
      'Ask about resume gaps, role fit, or what to fix next. I already know your profile and pipeline.',
    dismissLabel: 'Got it',
  },
  {
    key: PAGE_INTRO_KEYS.SETTINGS,
    match: (p) => p === '/settings' || p.startsWith('/settings/'),
    pose: 'idle',
    placement: 'bottom-right',
    className: undefined,
    title: 'Account & billing',
    message:
      'Manage your plan, application credits, email alerts, and account here.',
    dismissLabel: 'Got it',
  },
  {
    key: PAGE_INTRO_KEYS.ANALYTICS,
    match: (p) => p === '/analytics' || p.startsWith('/analytics/'),
    pose: 'peek',
    placement: 'peek-right',
    title: 'Mission Control',
    message:
      'Mission Control is where response rates and pipeline momentum will come together as the data builds.',
    dismissLabel: 'Got it',
  },
  {
    key: PAGE_INTRO_KEYS.PRICING,
    match: (p) => p === '/pricing' || p.startsWith('/pricing/'),
    pose: 'point',
    placement: 'bottom-right',
    title: 'Choose your pace',
    message:
      'Pick the pace that fits your search. Pro unlocks Scout applications, and Scout+ raises the monthly runway.',
    dismissLabel: 'Got it',
    outsideDashboardShell: true,
  },
  {
    key: PAGE_INTRO_KEYS.WELCOME,
    match: (p) => p === '/welcome' || p.startsWith('/welcome/'),
    pose: 'wave',
    placement: 'bottom-right',
    title: "You're in",
    message:
      "You're upgraded. Your new credits and Scout access are ready when you head back to the dashboard.",
    dismissLabel: 'Got it',
    ctaLabel: 'Go to dashboard',
    ctaHref: '/dashboard',
    outsideDashboardShell: true,
  },
] as const

/** First successful Send Scout acknowledgement (shown on Tracker). */
export const FIRST_SCOUT_RUN_INTRO = {
  key: PAGE_INTRO_KEYS.FIRST_SCOUT_RUN,
  pose: 'wave' as const,
  placement: 'bottom-right' as const,
  className: undefined as string | undefined,
  title: "Scout's on it",
  message: "Scout's on it. Watch each application move here in Tracker.",
  dismissLabel: 'Got it',
  ctaLabel: undefined as string | undefined,
  ctaHref: undefined as string | undefined,
}

/** Paths where the root-mounted mascot controller is allowed to run. */
export function isMascotHostPath(pathname: string | null): boolean {
  if (!pathname) return false
  if (
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/login') ||
    pathname === '/' ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/onboarding')
  ) {
    return false
  }
  // Dashboard shell routes + pricing/welcome
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/resume') ||
    pathname.startsWith('/explore') ||
    pathname.startsWith('/tracker') ||
    pathname.startsWith('/copilot') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/roles') ||
    pathname.startsWith('/scout') ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/welcome')
  ) {
    return true
  }
  return false
}

export function resolvePageIntro(
  pathname: string | null,
): PageIntroDef | null {
  if (!pathname) return null
  for (const def of PAGE_INTROS) {
    if (def.match(pathname)) return def
  }
  return null
}

export type SeenPageIntros = Record<string, boolean>

export function normalizeSeenPageIntros(
  raw: unknown,
): SeenPageIntros {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: SeenPageIntros = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === true || value === 'true' || typeof value === 'string') {
      // Timestamps or booleans both count as "seen"
      out[key] = true
    } else if (value === false) {
      out[key] = false
    }
  }
  return out
}

export function hasSeenPageIntro(
  seen: SeenPageIntros | null | undefined,
  key: PageIntroKey,
): boolean {
  return Boolean(seen?.[key])
}
