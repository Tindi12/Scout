'use client'

import Image from 'next/image'
import Link from 'next/link'
import { SignUp } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

export default function SignUpPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#080808] px-4 py-12 text-white sm:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[700px] w-[900px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle at center, rgba(255,103,51,0.10) 0%, rgba(255,103,51,0.04) 35%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-40 -z-10 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #1a1a1a 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-80 -z-10 h-[500px] w-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #1a1a1a 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage:
            'radial-gradient(ellipse at top, black 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at top, black 30%, transparent 75%)',
        }}
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] max-w-md flex-col items-center justify-center">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          aria-label="Scout home"
        >
          <Image
            src="/scout-logo.png"
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

        <div className="glass-card mt-8 w-full rounded-2xl p-6 md:p-8">
          <SignUp
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
