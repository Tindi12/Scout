import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  const { userId, sessionClaims } = await auth()
  const path = request.nextUrl.pathname
  const isAuthRoute =
    path.startsWith('/sign-in') ||
    path.startsWith('/sign-up') ||
    path.startsWith('/login')
  const metadata = sessionClaims?.metadata as
    | {
        onboardingComplete?: boolean
        publicMetadata?: { onboardingComplete?: boolean }
      }
    | undefined
  const publicMetadata = (sessionClaims?.public_metadata as
    | { onboardingComplete?: boolean }
    | undefined)
  const onboardingComplete =
    metadata?.onboardingComplete ??
    metadata?.publicMetadata?.onboardingComplete ??
    publicMetadata?.onboardingComplete

  if (userId && isAuthRoute) {
    const target = onboardingComplete === false ? '/onboarding' : '/dashboard'
    return NextResponse.redirect(new URL(target, request.url))
  }

  if (userId && path.startsWith('/dashboard') && onboardingComplete === false) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  if (userId && path.startsWith('/onboarding') && onboardingComplete === true) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/(api|trpc)(.*)',
  ],
}
