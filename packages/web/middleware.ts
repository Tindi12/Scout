import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getSupabaseUserByClerkId } from '@/lib/supabase-user-status'
import { isWaitlistMode } from '@/lib/waitlist-mode'

const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/blog(.*)',
  '/changelog(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
  // Sentry's tunnel endpoint (next.config tunnelRoute) — must stay unauthenticated so
  // client error reports from logged-out users (landing/sign-in pages) still get through.
  '/monitoring(.*)',
  // Cookie-consent record-keeping fires from the landing page, almost always while
  // logged out. Without this, Clerk's auth.protect() 404s the fetch. The handler
  // tolerates a null userId by design.
  '/api/consent(.*)',
  // Newsletter signup: same reasoning. The "Stay in the loop" form is on the landing
  // page and has no Clerk session to check; auth is the shared internal secret instead
  // (core/auth.py verify_internal_service).
  '/api/newsletter(.*)',
  // Soft-launch waitlist — Landing "Coming soon" dialog; service-role write only.
  '/api/waitlist(.*)',
  // Landing live counters poll paced platform totals while logged out.
  '/api/landing(.*)',
])

const isOnboardingRoute = createRouteMatcher(['/onboarding(.*)'])

const isAppRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/explore(.*)',
  '/resume(.*)',
  '/tracker(.*)',
  '/copilot(.*)',
  '/profile(.*)',
  '/settings(.*)',
  '/roles(.*)',
  '/analytics(.*)',
])

const isAuthRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
])

const isSignUpRoute = createRouteMatcher(['/sign-up(.*)'])

function readClerkOnboardingComplete(sessionClaims: unknown): boolean {
  const claims = sessionClaims as
    | {
        metadata?: {
          onboardingComplete?: boolean
          publicMetadata?: { onboardingComplete?: boolean }
        }
        public_metadata?: { onboardingComplete?: boolean }
      }
    | undefined

  const metadata = claims?.metadata
  const publicMetadata = claims?.public_metadata

  return (
    metadata?.onboardingComplete === true ||
    metadata?.publicMetadata?.onboardingComplete === true ||
    publicMetadata?.onboardingComplete === true
  )
}

export default clerkMiddleware(async (auth, request) => {
  const { userId, sessionClaims } = await auth()

  // Soft launch: block public Clerk sign-up; open the waitlist dialog instead.
  // /sign-in and /login stay reachable by direct URL for beta testers / team.
  if (isWaitlistMode() && !userId && isSignUpRoute(request)) {
    const url = new URL('/', request.url)
    url.searchParams.set('waitlist', '1')
    return NextResponse.redirect(url)
  }

  if (!userId) {
    if (!isPublicRoute(request)) {
      await auth.protect()
    }
    return
  }

  const dbUser = await getSupabaseUserByClerkId(userId)
  const clerkOnboardingComplete = readClerkOnboardingComplete(sessionClaims)
  const onboardingDone =
    dbUser?.onboarding_complete === true || clerkOnboardingComplete

  if (isAuthRoute(request)) {
    const target = onboardingDone ? '/dashboard' : '/onboarding'
    return NextResponse.redirect(new URL(target, request.url))
  }

  if (isAppRoute(request) && !onboardingDone) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  if (isOnboardingRoute(request) && onboardingDone) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!isPublicRoute(request) && !isOnboardingRoute(request) && !isAppRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip static assets (incl. .lottie / .wasm) so Clerk never auth.protect()s
    // public/ files — that was 404ing How-it-works animations on prod.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|lottie|wasm|json)$).*)',
    '/(api|trpc)(.*)',
  ],
}
