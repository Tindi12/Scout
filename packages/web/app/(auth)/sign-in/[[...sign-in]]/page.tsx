'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BrandedLoader } from '@/components/branded-loader'
import { scoutLogo } from '@/lib/scout-logo'
import { ClerkLoaded, ClerkLoading, SignIn } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

export default function SignInPage() {
  const pathname = usePathname()
  // OAuth returns to /sign-in/sso-callback (this same catch-all route, so no
  // loading.tsx fires). Cover Clerk's headless session transfer + redirect with
  // the branded full-screen loader instead of its default bare spinner. <SignIn>
  // stays mounted underneath to actually process the callback.
  const isCallback = pathname?.includes('sso-callback')

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#000000] px-4 py-12 text-white sm:py-16">
      {isCallback && <BrandedLoader label="Finishing sign in" />}

      <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] max-w-md flex-col items-center justify-center">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          aria-label="Scout home"
        >
          <Image
            src={scoutLogo}
            alt="Scout"
            width={36}
            height={36}
            priority
            draggable={false}
            className="h-9 w-9 select-none object-contain"
          />
          <span className="font-headline text-xl font-semibold tracking-tight text-white">
            Scout
          </span>
        </Link>

        <p className="mt-3 font-body text-sm text-[#888]">
          Your autonomous internship agent
        </p>

        <div className="relative mt-8 w-full">
          <div className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] p-4 sm:p-5">
            <ClerkLoading>
              <BrandedLoader inline label="Loading" />
            </ClerkLoading>
            <ClerkLoaded>
            <SignIn
              routing="path"
              path="/sign-in"
              appearance={{
                baseTheme: dark,
                variables: {
                  colorPrimary: '#FF6733',
                  colorBackground: '#111111',
                  colorText: '#ffffff',
                  colorTextSecondary: '#888888',
                  colorInputBackground: '#1a1a1a',
                  colorInputText: '#ffffff',
                  borderRadius: '6px',
                },
                elements: {
                  rootBox: 'w-full',
                  cardBox: 'w-full overflow-hidden rounded-lg border border-white/15 shadow-none bg-[#0a0a0a]',
                  card: 'w-full bg-transparent shadow-none',
                  formButtonPrimary: 'shadow-none !bg-[#FF6733] hover:!bg-[#e85c2e]',
                },
              }}
            />
            </ClerkLoaded>
          </div>
        </div>

        <p className="mt-6 font-body text-sm text-[#888]">
          Don&apos;t have an account?{' '}
          <Link
            href="/sign-up"
            className="font-medium text-[#FF6733] transition-colors hover:text-[#FF6733]/80"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  )
}
