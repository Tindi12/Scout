/** Fixed landing nav clearance when scrolling to in-page sections. */
const NAV_CLEARANCE_PX = 96

let activeScrollRaf = 0

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function cancelActiveScroll() {
  if (activeScrollRaf) {
    window.cancelAnimationFrame(activeScrollRaf)
    activeScrollRaf = 0
  }
}

function animateScrollTo(targetY: number) {
  cancelActiveScroll()

  const startY = window.scrollY
  const distance = targetY - startY
  if (Math.abs(distance) < 1) return

  // Keep long-page jumps snappy — native smooth scroll often feels delayed.
  const duration = Math.min(520, Math.max(260, Math.abs(distance) * 0.32))
  let startTime = 0

  const step = (now: number) => {
    if (!startTime) startTime = now
    const t = Math.min(1, (now - startTime) / duration)
    const eased = 1 - (1 - t) ** 3
    window.scrollTo({ top: startY + distance * eased, left: 0, behavior: 'auto' })
    if (t < 1) {
      activeScrollRaf = window.requestAnimationFrame(step)
    } else {
      activeScrollRaf = 0
    }
  }

  activeScrollRaf = window.requestAnimationFrame(step)
}

function resolveScrollTop(hash: string): number | null {
  const id = hash.startsWith('#') ? hash.slice(1) : hash
  if (!id || id === 'top') return 0

  const target = document.getElementById(id)
  if (!target) return null

  return (
    target.getBoundingClientRect().top + window.scrollY - NAV_CLEARANCE_PX
  )
}

/**
 * Instantly start a controlled smooth scroll to a landing-page hash.
 * Returns false if the target is missing (caller can fall through to navigation).
 */
export function scrollToLandingHash(
  hash: string,
  options?: { updateHistory?: boolean },
): boolean {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`
  const top = resolveScrollTop(normalized)
  if (top === null) return false

  if (options?.updateHistory !== false) {
    const nextUrl = `${window.location.pathname}${window.location.search}${normalized}`
    if (window.location.hash !== normalized) {
      window.history.pushState(null, '', nextUrl)
    }
  }

  if (prefersReducedMotion()) {
    cancelActiveScroll()
    window.scrollTo({ top, left: 0, behavior: 'auto' })
    return true
  }

  animateScrollTo(Math.max(0, top))
  return true
}

/**
 * Intercept same-page landing hash clicks so Next.js soft-nav does not
 * introduce a pause before scrolling begins.
 */
export function handleLandingHashClick(
  event: Pick<
    MouseEvent,
    'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'preventDefault'
  >,
  href: string,
): boolean {
  if (event.defaultPrevented) return false
  if (event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false
  }
  if (typeof window === 'undefined') return false
  if (window.location.pathname !== '/') return false

  const hashIndex = href.indexOf('#')
  if (hashIndex < 0) return false

  const hash = href.slice(hashIndex)
  if (!hash || hash === '#') return false

  // Allow absolute paths that still target this landing page.
  const pathPart = href.slice(0, hashIndex)
  if (pathPart && pathPart !== '/' && pathPart !== window.location.pathname) {
    return false
  }

  if (!scrollToLandingHash(hash)) return false

  event.preventDefault()
  return true
}
