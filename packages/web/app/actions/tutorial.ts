'use server'

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

import {
  isPageIntroKey,
  type PageIntroKey,
} from '@/lib/page-intros'

const NUDGE_SHOW_COOLDOWN_MS = 24 * 60 * 60 * 1000
const NUDGE_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) {
    throw new Error('Server misconfigured: Supabase credentials missing.')
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type TutorialState = {
  has_seen_intro_tour: boolean
  profile_nudge_dismissed_at: string | null
  last_profile_nudge_shown_at: string | null
  profile_complete: boolean
  seen_page_intros: Record<string, boolean>
}

function elapsedMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return null
  return now - ts
}

/** Persist that the one-time intro tour was finished or skipped. Idempotent. */
export async function markIntroTourSeen(): Promise<
  { success: true } | { error: string }
> {
  const { userId } = await auth()
  if (!userId) return { error: 'Unauthorized' }

  try {
    const admin = getAdmin()
    const { error } = await admin
      .from('users')
      .update({ has_seen_intro_tour: true })
      .eq('clerk_id', userId)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update tour state',
    }
  }
}

/**
 * Atomically claim a one-time page intro (or first_scout_run) key via RPC.
 * Returns claimed:true only on the first successful claim.
 */
export async function claimPageIntroImpression(
  key: string,
): Promise<
  { claimed: true; key: PageIntroKey } | { claimed: false; reason: string } | { error: string }
> {
  const { userId } = await auth()
  if (!userId) return { error: 'Unauthorized' }

  if (!isPageIntroKey(key)) {
    return { claimed: false, reason: 'invalid_key' }
  }

  try {
    const admin = getAdmin()
    const { data, error } = await admin.rpc('claim_page_intro', {
      p_clerk_id: userId,
      p_intro_key: key,
    })

    if (error) return { error: error.message }
    if (data === true) return { claimed: true, key }
    return { claimed: false, reason: 'already_seen' }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to claim page intro',
    }
  }
}

/**
 * Claim a nudge impression if server-side cooldowns allow it.
 * On success, writes `last_profile_nudge_shown_at = now()`.
 */
export async function claimProfileNudgeImpression(): Promise<
  { claimed: true } | { claimed: false; reason: string } | { error: string }
> {
  const { userId } = await auth()
  if (!userId) return { error: 'Unauthorized' }

  try {
    const admin = getAdmin()
    const { data, error } = await admin
      .from('users')
      .select(
        'profile_complete, has_seen_intro_tour, profile_nudge_dismissed_at, last_profile_nudge_shown_at',
      )
      .eq('clerk_id', userId)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { claimed: false, reason: 'user_not_found' }

    if (data.profile_complete) {
      return { claimed: false, reason: 'profile_complete' }
    }
    if (!data.has_seen_intro_tour) {
      return { claimed: false, reason: 'intro_not_seen' }
    }

    const now = Date.now()
    const sinceDismissed = elapsedMs(data.profile_nudge_dismissed_at, now)
    if (
      sinceDismissed != null &&
      sinceDismissed < NUDGE_DISMISS_COOLDOWN_MS
    ) {
      return { claimed: false, reason: 'dismiss_cooldown' }
    }

    const sinceShown = elapsedMs(data.last_profile_nudge_shown_at, now)
    if (sinceShown != null && sinceShown < NUDGE_SHOW_COOLDOWN_MS) {
      return { claimed: false, reason: 'show_cooldown' }
    }

    const shownAt = new Date().toISOString()
    const { error: updateError } = await admin
      .from('users')
      .update({ last_profile_nudge_shown_at: shownAt })
      .eq('clerk_id', userId)

    if (updateError) return { error: updateError.message }
    return { claimed: true }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to claim nudge impression',
    }
  }
}

/** Record an explicit "Not now" dismissal — starts the 7-day cooldown. */
export async function dismissProfileNudge(): Promise<
  { success: true } | { error: string }
> {
  const { userId } = await auth()
  if (!userId) return { error: 'Unauthorized' }

  try {
    const admin = getAdmin()
    const { error } = await admin
      .from('users')
      .update({ profile_nudge_dismissed_at: new Date().toISOString() })
      .eq('clerk_id', userId)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to dismiss nudge',
    }
  }
}
