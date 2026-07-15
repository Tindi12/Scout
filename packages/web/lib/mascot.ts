export type MascotPose = 'idle' | 'wave' | 'point' | 'peek'

/** Exact public paths for Scout mascot assets — do not invent alternates. */
export const MASCOT_ASSETS: Record<MascotPose, string> = {
  idle: '/mascot/mascot-idle.png',
  wave: '/mascot/mascot-wave.png',
  point: '/mascot/mascot-point.png',
  peek: '/mascot/mascot-peek.png',
}

export const PROFILE_TOUR_TARGET_ID = 'scout-tour-profile-nav'

export const NUDGE_SESSION_KEY = 'scout:profile_nudge_shown_session'

export const ACTIVE_RUN_KEY = 'scout:active-run-id'

export const SCOUT_RUN_STARTED_EVENT = 'scout:run_started'

export const FIRST_SCOUT_RUN_PENDING_KEY = 'scout:first_run_ack_pending'

export type IntroTourStep = 'welcome' | 'guide' | 'profile' | null

export type MascotMode =
  | 'hidden'
  | 'idle'
  | 'intro-welcome'
  | 'intro-guide'
  | 'intro-profile'
  | 'first-run-ack'
  | 'page-intro'
  | 'nudge'

export type ScoutRunStartedDetail = {
  scout_run_id: string
  job_count?: number
  source?: 'explore_batch' | 'retry'
}
