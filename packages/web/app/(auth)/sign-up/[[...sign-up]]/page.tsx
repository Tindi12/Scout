'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BrandedLoader } from '@/components/branded-loader'
import { scoutLogo } from '@/lib/scout-logo'
import { ClerkLoaded, ClerkLoading, SignUp } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

export default function SignUpPage() {
  const pathname = usePathname()
  // OAuth returns to /sign-up/sso-callback (this same catch-all route, so no
  // loading.tsx fires). Cover Clerk's headless session transfer + redirect with
  // the branded full-screen loader instead of its default bare spinner. <SignUp>
  // stays mounted underneath to actually process the callback.
  const isCallback = pathname?.includes('sso-callback')

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#000000] px-4 py-12 text-white sm:py-16">
      {isCallback && <BrandedLoader label="Finishing sign up" />}

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
          Join thousands of students landing internships
        </p>

        <div className="relative mt-8 w-full">
          <div className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] p-4 sm:p-5">
            <ClerkLoading>
              <BrandedLoader inline label="Loading" />
            </ClerkLoading>
            <ClerkLoaded>
            <SignUp
              routing="path"
              path="/sign-up"
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
            <p className="mt-3 px-2 text-center font-body text-xs leading-relaxed text-[#888]">
                By creating an account, you agree to Scout&apos;s{' '}
                <Link
                  href="/terms"
                  className="text-[#FF6733] underline-offset-2 hover:underline"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  className="text-[#FF6733] underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </Link>
                .
            </p>
          </div>
        </div>

        <p className="mt-6 font-body text-sm text-[#888]">
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-[#FF6733] transition-colors hover:text-[#FF6733]/80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
