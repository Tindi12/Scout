'use client'

import { useUser } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  claimPageIntroImpression,
  claimProfileNudgeImpression,
  dismissProfileNudge,
  markIntroTourSeen,
} from '@/app/actions/tutorial'
import { ScoutMascot } from '@/components/mascot/ScoutMascot'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
import {
  ACTIVE_RUN_KEY,
  FIRST_SCOUT_RUN_PENDING_KEY,
  NUDGE_SESSION_KEY,
  PROFILE_TOUR_TARGET_ID,
  SCOUT_RUN_STARTED_EVENT,
  type IntroTourStep,
  type MascotMode,
  type ScoutRunStartedDetail,
} from '@/lib/mascot'
import {
  FIRST_SCOUT_RUN_INTRO,
  PAGE_INTRO_KEYS,
  hasSeenPageIntro,
  isMascotHostPath,
  normalizeSeenPageIntros,
  resolvePageIntro,
  type PageIntroDef,
  type PageIntroKey,
  type SeenPageIntros,
} from '@/lib/page-intros'
import { setMascotGuideActive } from '@/lib/mascot-presence'
import {
  computeProfileCompletion,
  type ProfileData,
} from '@/lib/profile-completion'

type MePayload = {
  profile_complete?: boolean
  has_seen_intro_tour?: boolean
  profile_nudge_dismissed_at?: string | null
  last_profile_nudge_shown_at?: string | null
  seen_page_intros?: SeenPageIntros
  profile?: Partial<ProfileData> | null
}

type TutorialSnapshot = {
  profileComplete: boolean
  hasSeenIntroTour: boolean
  seenPageIntros: SeenPageIntros
  profile: Partial<ProfileData> | null
  loaded: boolean
}

function readSessionNudgeShown(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(NUDGE_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeSessionNudgeShown() {
  try {
    window.sessionStorage.setItem(NUDGE_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

function hasActiveRunInSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(window.sessionStorage.getItem(ACTIVE_RUN_KEY)?.trim())
  } catch {
    return false
  }
}

function readFirstRunPending(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(FIRST_SCOUT_RUN_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

function writeFirstRunPending(on: boolean) {
  try {
    if (on) {
      window.sessionStorage.setItem(FIRST_SCOUT_RUN_PENDING_KEY, '1')
    } else {
      window.sessionStorage.removeItem(FIRST_SCOUT_RUN_PENDING_KEY)
    }
  } catch {
    /* ignore */
  }
}

function setProfileNavHighlight(on: boolean) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(PROFILE_TOUR_TARGET_ID)
  if (!el) return
  if (on) {
    el.setAttribute('data-tour-highlight', 'true')
    el.classList.add('shadow-[inset_0_0_0_1px_#FF6733]')
  } else {
    el.removeAttribute('data-tour-highlight')
    el.classList.remove('shadow-[inset_0_0_0_1px_#FF6733]')
  }
}

function markSeenLocally(
  prev: SeenPageIntros,
  key: PageIntroKey,
): SeenPageIntros {
  if (prev[key]) return prev
  return { ...prev, [key]: true }
}

export function ScoutMascotController() {
  const pathname = usePathname()
  const { user, isLoaded: clerkLoaded } = useUser()

  const [snapshot, setSnapshot] = useState<TutorialSnapshot>({
    profileComplete: true,
    hasSeenIntroTour: true,
    seenPageIntros: {},
    profile: null,
    loaded: false,
  })
  const [introStep, setIntroStep] = useState<IntroTourStep>(null)
  const [nudgeVisible, setNudgeVisible] = useState(false)
  const [activePageIntro, setActivePageIntro] = useState<PageIntroDef | null>(
    null,
  )
  const [firstRunAckVisible, setFirstRunAckVisible] = useState(false)

  const introPersistedRef = useRef(false)
  const introShownTrackedRef = useRef(false)
  const nudgeAttemptedRef = useRef(false)
  const pageIntroAttemptedRef = useRef<string | null>(null)
  const firstRunClaimedRef = useRef(false)
  const firstRunShownTrackedRef = useRef(false)

  const firstName =
    user?.firstName ??
    user?.username ??
    user?.fullName?.split(' ')[0] ??
    'there'

  const onHostPath = isMascotHostPath(pathname)

  const refresh = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/user/me', { cache: 'no-store' })
      if (!res.ok) {
        setSnapshot((prev) => ({ ...prev, loaded: true }))
        return
      }
      const body = (await res.json()) as MePayload
      setSnapshot((prev) => ({
        profileComplete: Boolean(body.profile_complete),
        hasSeenIntroTour: Boolean(body.has_seen_intro_tour),
        // Preserve optimistic local claims that may not have round-tripped yet.
        seenPageIntros: {
          ...normalizeSeenPageIntros(body.seen_page_intros),
          ...prev.seenPageIntros,
        },
        profile: body.profile ?? null,
        loaded: true,
      }))
    } catch {
      setSnapshot((prev) => ({ ...prev, loaded: true }))
    }
  }, [user?.id])

  useEffect(() => {
    if (!clerkLoaded || !user?.id || !onHostPath) return
    void refresh()
  }, [clerkLoaded, user?.id, pathname, refresh, onHostPath])

  useEffect(() => {
    const onProfileSaved = () => {
      void refresh()
    }
    window.addEventListener('scout:profile_saved', onProfileSaved)
    return () =>
      window.removeEventListener('scout:profile_saved', onProfileSaved)
  }, [refresh])

  const persistIntroSeen = useCallback(async () => {
    if (introPersistedRef.current) return
    introPersistedRef.current = true
    setSnapshot((prev) => ({ ...prev, hasSeenIntroTour: true }))
    const result = await markIntroTourSeen()
    if ('error' in result) {
      introPersistedRef.current = false
      setSnapshot((prev) => ({ ...prev, hasSeenIntroTour: false }))
    }
  }, [])

  const claimAndMark = useCallback(async (key: PageIntroKey) => {
    const result = await claimPageIntroImpression(key)
    if ('claimed' in result && result.claimed) {
      setSnapshot((prev) => ({
        ...prev,
        seenPageIntros: markSeenLocally(prev.seenPageIntros, key),
      }))
      return true
    }
    if ('claimed' in result && !result.claimed) {
      // Already seen on server — sync local state.
      setSnapshot((prev) => ({
        ...prev,
        seenPageIntros: markSeenLocally(prev.seenPageIntros, key),
      }))
      return false
    }
    return false
  }, [])

  // ——— First-run Send Scout acknowledgement ———
  const beginFirstRunAck = useCallback(async () => {
    if (firstRunClaimedRef.current) return
    if (
      hasSeenPageIntro(snapshot.seenPageIntros, PAGE_INTRO_KEYS.FIRST_SCOUT_RUN)
    ) {
      return
    }
    firstRunClaimedRef.current = true
    writeFirstRunPending(true)

    const claimed = await claimAndMark(PAGE_INTRO_KEYS.FIRST_SCOUT_RUN)
    // Mark generic tracker intro so we never stack two messages.
    await claimAndMark(PAGE_INTRO_KEYS.TRACKER)

    if (!claimed) {
      writeFirstRunPending(false)
      return
    }

    // Reveal immediately if we already landed on Tracker; otherwise the
    // pending flag survives the Explore → Tracker client navigation.
    if (pathname?.startsWith('/tracker')) {
      setFirstRunAckVisible(true)
      writeFirstRunPending(false)
    }
  }, [claimAndMark, pathname, snapshot.seenPageIntros])

  useEffect(() => {
    const onRunStarted = (event: Event) => {
      const detail = (event as CustomEvent<ScoutRunStartedDetail>).detail
      if (!detail?.scout_run_id) return
      if (detail.source === 'retry') return
      void beginFirstRunAck()
    }
    window.addEventListener(SCOUT_RUN_STARTED_EVENT, onRunStarted)
    return () =>
      window.removeEventListener(SCOUT_RUN_STARTED_EVENT, onRunStarted)
  }, [beginFirstRunAck])

  // Carry the pending first-run ack through Explore → Tracker, or recover
  // after a refresh mid-transition via the session flag.
  useEffect(() => {
    if (!pathname?.startsWith('/tracker')) return
    if (!snapshot.loaded) return
    if (firstRunAckVisible) return
    if (!readFirstRunPending()) return

    if (
      !hasSeenPageIntro(
        snapshot.seenPageIntros,
        PAGE_INTRO_KEYS.FIRST_SCOUT_RUN,
      ) &&
      !firstRunClaimedRef.current
    ) {
      void beginFirstRunAck()
      return
    }

    setFirstRunAckVisible(true)
    writeFirstRunPending(false)
  }, [
    pathname,
    snapshot.loaded,
    snapshot.seenPageIntros,
    firstRunAckVisible,
    beginFirstRunAck,
  ])

  // ——— Global first-run tour ———
  useEffect(() => {
    if (!snapshot.loaded || !onHostPath) return
    if (snapshot.hasSeenIntroTour) return
    if (introStep !== null) return
    if (!pathname?.startsWith('/dashboard')) return
    setIntroStep('welcome')
  }, [
    snapshot.loaded,
    snapshot.hasSeenIntroTour,
    introStep,
    pathname,
    onHostPath,
  ])

  useEffect(() => {
    if (introStep !== 'guide') return
    if (!pathname?.startsWith('/profile')) return
    setIntroStep('profile')
  }, [introStep, pathname])

  // If the user leaves the tour mid-way (e.g. skips Profile and opens Explore),
  // end the global tour so per-page intros can still run. Profile completeness
  // must never block contextual page guidance.
  useEffect(() => {
    if (introStep === null) return
    if (!pathname) return
    const stillInTourSurface =
      pathname.startsWith('/dashboard') || pathname.startsWith('/profile')
    if (stillInTourSurface) return
    setIntroStep(null)
    setProfileNavHighlight(false)
    writeSessionNudgeShown()
    nudgeAttemptedRef.current = true
    void persistIntroSeen()
  }, [introStep, pathname, persistIntroSeen])

  useEffect(() => {
    setProfileNavHighlight(introStep === 'guide')
    return () => setProfileNavHighlight(false)
  }, [introStep])

  useEffect(() => {
    if (introStep !== 'welcome') return
    if (introShownTrackedRef.current) return
    introShownTrackedRef.current = true
    track(ANALYTICS_EVENTS.INTRO_TOUR_SHOWN)
    void persistIntroSeen()
  }, [introStep, persistIntroSeen])

  // ——— Contextual page intros ———
  // Independent of profile_complete: incomplete profiles still get Explore,
  // Tracker, Copilot, etc. intros once the first-run tour is done/skipped.
  useEffect(() => {
    if (!snapshot.loaded || !onHostPath) return
    if (!snapshot.hasSeenIntroTour) return
    if (introStep !== null) return
    if (firstRunAckVisible) return
    // Intentionally do NOT gate on snapshot.profileComplete.

    const def = resolvePageIntro(pathname)
    if (!def) {
      setActivePageIntro(null)
      pageIntroAttemptedRef.current = null
      return
    }

    // Already showing this intro for the current route — leave it up until
    // dismiss or navigation. (Claim already marked the key as seen.)
    if (activePageIntro?.key === def.key) return

    if (hasSeenPageIntro(snapshot.seenPageIntros, def.key)) {
      return
    }

    if (
      def.suppressWhenActiveRun &&
      hasActiveRunInSession() &&
      !readFirstRunPending()
    ) {
      return
    }

    if (pageIntroAttemptedRef.current === def.key) return

    pageIntroAttemptedRef.current = def.key
    let cancelled = false
    void (async () => {
      const claimed = await claimAndMark(def.key)
      if (cancelled) return
      if (claimed) {
        setActivePageIntro(def)
        track(ANALYTICS_EVENTS.PAGE_INTRO_SHOWN, { page: def.key })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    snapshot.loaded,
    snapshot.hasSeenIntroTour,
    snapshot.seenPageIntros,
    introStep,
    firstRunAckVisible,
    pathname,
    onHostPath,
    activePageIntro?.key,
    claimAndMark,
  ])

  // Clear page intro when leaving its route.
  useEffect(() => {
    if (!activePageIntro) return
    if (!activePageIntro.match(pathname ?? '')) {
      setActivePageIntro(null)
    }
  }, [pathname, activePageIntro])

  const completion = useMemo(
    () => computeProfileCompletion(snapshot.profile),
    [snapshot.profile],
  )

  const missingPreview = useMemo(() => {
    const labels = completion.missingFieldLabels.slice(0, 4)
    if (labels.length === 0) return null
    if (labels.length === 1) return labels[0]
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
    return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
  }, [completion.missingFieldLabels])

  // ——— Profile nudge ———
  useEffect(() => {
    if (!snapshot.loaded || !onHostPath) return
    if (!snapshot.hasSeenIntroTour) return
    if (snapshot.profileComplete) {
      setNudgeVisible(false)
      return
    }
    if (introStep !== null) return
    if (firstRunAckVisible) return
    if (activePageIntro) return
    if (nudgeVisible || nudgeAttemptedRef.current) return
    if (pathname?.startsWith('/profile')) return
    if (pathname?.startsWith('/copilot')) return
    if (pathname?.startsWith('/tracker') && hasActiveRunInSession()) return
    if (pathname?.startsWith('/pricing') || pathname?.startsWith('/welcome')) {
      return
    }
    if (readSessionNudgeShown()) {
      nudgeAttemptedRef.current = true
      return
    }

    nudgeAttemptedRef.current = true
    let cancelled = false
    void (async () => {
      const result = await claimProfileNudgeImpression()
      if (cancelled) return
      if ('claimed' in result && result.claimed) {
        writeSessionNudgeShown()
        setNudgeVisible(true)
        track(ANALYTICS_EVENTS.PROFILE_NUDGE_SHOWN)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    snapshot.loaded,
    snapshot.hasSeenIntroTour,
    snapshot.profileComplete,
    introStep,
    firstRunAckVisible,
    activePageIntro,
    nudgeVisible,
    pathname,
    onHostPath,
  ])

  const finishIntro = useCallback(
    (reason: 'skip' | 'done') => {
      setIntroStep(null)
      setProfileNavHighlight(false)
      writeSessionNudgeShown()
      nudgeAttemptedRef.current = true
      void persistIntroSeen()
      if (reason === 'skip') {
        track(ANALYTICS_EVENTS.INTRO_TOUR_SKIPPED)
      }
    },
    [persistIntroSeen],
  )

  const onContinueIntro = useCallback(() => {
    track(ANALYTICS_EVENTS.INTRO_TOUR_CONTINUED)
    void persistIntroSeen()
    setIntroStep('guide')
  }, [persistIntroSeen])

  const onDismissNudge = useCallback(() => {
    setNudgeVisible(false)
    writeSessionNudgeShown()
    track(ANALYTICS_EVENTS.PROFILE_NUDGE_DISMISSED)
    void dismissProfileNudge()
  }, [])

  const onDismissPageIntro = useCallback(() => {
    if (activePageIntro) {
      track(ANALYTICS_EVENTS.PAGE_INTRO_DISMISSED, {
        page: activePageIntro.key,
      })
    }
    setActivePageIntro(null)
  }, [activePageIntro])

  const onDismissFirstRunAck = useCallback(() => {
    setFirstRunAckVisible(false)
    writeFirstRunPending(false)
    track(ANALYTICS_EVENTS.FIRST_SCOUT_RUN_ACK_DISMISSED)
  }, [])

  useEffect(() => {
    if (!firstRunAckVisible) return
    if (firstRunShownTrackedRef.current) return
    firstRunShownTrackedRef.current = true
    track(ANALYTICS_EVENTS.FIRST_SCOUT_RUN_ACK_SHOWN)
  }, [firstRunAckVisible])

  const mode: MascotMode = useMemo(() => {
    if (!onHostPath || !snapshot.loaded || !clerkLoaded || !user?.id) {
      return 'hidden'
    }
    if (introStep === 'welcome') return 'intro-welcome'
    if (introStep === 'guide') return 'intro-guide'
    if (introStep === 'profile') return 'intro-profile'
    if (firstRunAckVisible && pathname?.startsWith('/tracker')) {
      return 'first-run-ack'
    }
    if (activePageIntro) return 'page-intro'
    if (nudgeVisible && !snapshot.profileComplete) return 'nudge'
    if (pathname?.startsWith('/copilot')) return 'hidden'
    if (pathname?.startsWith('/pricing') || pathname?.startsWith('/welcome')) {
      return 'hidden'
    }
    return 'idle'
  }, [
    onHostPath,
    snapshot.loaded,
    snapshot.profileComplete,
    clerkLoaded,
    user?.id,
    introStep,
    firstRunAckVisible,
    activePageIntro,
    nudgeVisible,
    pathname,
  ])

  useEffect(() => {
    if (
      mode === 'hidden' ||
      mode === 'idle'
    )
      return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (introStep !== null) finishIntro('skip')
      else if (firstRunAckVisible) onDismissFirstRunAck()
      else if (activePageIntro) onDismissPageIntro()
      else if (nudgeVisible) onDismissNudge()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    mode,
    introStep,
    firstRunAckVisible,
    activePageIntro,
    nudgeVisible,
    finishIntro,
    onDismissFirstRunAck,
    onDismissPageIntro,
    onDismissNudge,
  ])

  // Hide the Copilot mascot launcher while any guide speech owns the corner.
  useEffect(() => {
    const guideOwnsCorner =
      mode !== 'hidden' && mode !== 'idle'
    setMascotGuideActive(guideOwnsCorner)
    return () => setMascotGuideActive(false)
  }, [mode])

  if (mode === 'hidden' || mode === 'idle') return null

  if (mode === 'intro-welcome') {
    return (
      <ScoutMascot
        pose="wave"
        placement="bottom-right"
        title={`Hey ${firstName}. I'll help you get Scout ready.`}
        message="Quick tour, then you're free. You can skip anytime."
        onDismiss={() => finishIntro('skip')}
        dismissLabel="Skip intro"
        actions={[
          { label: 'Show me', onClick: onContinueIntro },
          {
            label: "I'll figure it out",
            variant: 'ghost',
            onClick: () => finishIntro('skip'),
          },
        ]}
      />
    )
  }

  if (mode === 'intro-guide') {
    return (
      <ScoutMascot
        pose="point"
        placement="bottom-right"
        title="Start with your Profile"
        message="That's where Scout learns how to fill real applications for you: contact, authorization, school, preferences."
        onDismiss={() => finishIntro('skip')}
        dismissLabel="Skip intro"
        actions={[
          {
            label: 'Go to Profile',
            href: '/profile',
            onClick: () => {
              track(ANALYTICS_EVENTS.PROFILE_NUDGE_CTA_CLICKED, {
                source: 'intro_guide',
              })
            },
          },
          {
            label: 'Skip',
            variant: 'ghost',
            onClick: () => finishIntro('skip'),
          },
        ]}
      />
    )
  }

  if (mode === 'intro-profile') {
    return (
      <ScoutMascot
        pose="point"
        placement="bottom-right"
        title="Fill in the essentials"
        message={
          missingPreview
            ? `Work through Contact, Work auth, Education, and Preferences. Still open: ${missingPreview}.`
            : 'Work through Contact, Work auth, Education, and Preferences. Then Scout can apply on your behalf.'
        }
        onDismiss={() => finishIntro('done')}
        dismissLabel="Got it"
        actions={[
          {
            label: 'Got it',
            onClick: () => finishIntro('done'),
          },
        ]}
      />
    )
  }

  if (mode === 'first-run-ack') {
    return (
      <ScoutMascot
        pose={FIRST_SCOUT_RUN_INTRO.pose}
        placement={FIRST_SCOUT_RUN_INTRO.placement}
        className={FIRST_SCOUT_RUN_INTRO.className}
        title={FIRST_SCOUT_RUN_INTRO.title}
        message={FIRST_SCOUT_RUN_INTRO.message}
        onDismiss={onDismissFirstRunAck}
        dismissLabel={FIRST_SCOUT_RUN_INTRO.dismissLabel}
        actions={[
          {
            label: 'Got it',
            onClick: onDismissFirstRunAck,
          },
        ]}
      />
    )
  }

  if (mode === 'page-intro' && activePageIntro) {
    const actions = [
      ...(activePageIntro.ctaHref
        ? [
            {
              label: activePageIntro.ctaLabel ?? 'Continue',
              href: activePageIntro.ctaHref,
              onClick: onDismissPageIntro,
            },
          ]
        : [
            {
              label: activePageIntro.dismissLabel ?? 'Got it',
              onClick: onDismissPageIntro,
            },
          ]),
    ]

    return (
      <ScoutMascot
        pose={activePageIntro.pose}
        placement={activePageIntro.placement ?? 'bottom-right'}
        className={activePageIntro.className}
        title={activePageIntro.title}
        message={activePageIntro.message}
        onDismiss={onDismissPageIntro}
        dismissLabel={activePageIntro.dismissLabel ?? 'Got it'}
        peripheral={activePageIntro.placement === 'peek-right'}
        actions={actions}
      />
    )
  }

  if (mode === 'nudge') {
    return (
      <ScoutMascot
        pose="peek"
        placement="peek-right"
        peripheral
        title="Your profile's still a bit thin"
        message="A couple more fields and Scout can actually submit for you."
        onDismiss={onDismissNudge}
        dismissLabel="Not now"
        speechMaxWidth="max-w-[14.5rem]"
        actions={[
          {
            label: 'Finish profile',
            href: '/profile',
            onClick: () => {
              track(ANALYTICS_EVENTS.PROFILE_NUDGE_CTA_CLICKED, {
                source: 'nudge',
              })
              setNudgeVisible(false)
            },
          },
          {
            label: 'Not now',
            variant: 'ghost',
            onClick: onDismissNudge,
          },
        ]}
      />
    )
  }

  return null
}
