import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { getSupabaseUserByClerkId } from '@/lib/supabase-user-status'

const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
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
  const path = request.nextUrl.pathname

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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/(api|trpc)(.*)',
  ],
}
