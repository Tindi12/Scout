'use client'

import Image from 'next/image'
import Link from 'next/link'

import { scoutLogo } from '@/lib/scout-logo'
import { SignIn } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

export default function SignInPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#000000] px-4 py-12 text-white sm:py-16">
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
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-6 -z-10 h-56 rounded-full blur-[120px]"
            style={{
              background:
                'radial-gradient(circle at center, rgba(255,103,51,0.2) 0%, rgba(255,103,51,0.1) 40%, transparent 75%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-2 -z-10 opacity-60"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              maskImage:
                'radial-gradient(ellipse at center, black 25%, transparent 75%)',
              WebkitMaskImage:
                'radial-gradient(ellipse at center, black 25%, transparent 75%)',
            }}
          />
          <div className="relative w-full overflow-hidden rounded-2xl p-[1px]">
            <span
              aria-hidden
              className="absolute inset-[-1000%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#000000_0%,#000000_50%,#FF6733_100%)]"
            />
            <div className="relative z-10 w-full rounded-2xl bg-[#0a0a0a] p-6 backdrop-blur-xl md:p-8">
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
                    borderRadius: '12px',
                  },
                  elements: {
                    card: 'shadow-none bg-transparent',
                    rootBox: 'w-full',
                  },
                }}
              />
            </div>
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
