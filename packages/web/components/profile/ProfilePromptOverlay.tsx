'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { scoutLogo } from '@/lib/scout-logo'
import {
  dismissProfilePrompt,
  isProfilePromptDismissed,
} from '@/lib/profile-prompt-dismiss'

type ProfilePromptOverlayProps = {
  clerkUserId: string
  open: boolean
  onDismiss: () => void
}

function subscribeDismissed(onStoreChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'scout:profile_prompt_dismissed') onStoreChange()
  }
  const onCustom = () => onStoreChange()
  window.addEventListener('storage', onStorage)
  window.addEventListener('scout:profile_prompt_dismissed', onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('scout:profile_prompt_dismissed', onCustom)
  }
}

export function ProfilePromptOverlay({
  clerkUserId,
  open,
  onDismiss,
}: ProfilePromptOverlayProps) {
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    () => isProfilePromptDismissed(clerkUserId),
    () => false,
  )

  if (!open || dismissed) return null

  const handleLater = () => {
    dismissProfilePrompt(clerkUserId)
    onDismiss()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-prompt-title"
      className="fixed inset-0 z-[100] flex animate-in fade-in items-center justify-center p-4 duration-200 sm:p-6"
    >
      <button
        type="button"
        aria-label="Dismiss profile prompt"
        className="absolute inset-0 bg-[#050505]/85 backdrop-blur-md"
        onClick={handleLater}
      />

      <div
        className="glass-card-strong relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0a0a0a]/95 p-6 shadow-[0_0_80px_rgba(255,103,51,0.12)] sm:p-8"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40"
          style={{
            background:
              'radial-gradient(circle, rgba(255,103,51,0.35) 0%, transparent 70%)',
          }}
        />

        <div className="relative flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#FF6733]/30 bg-[#FF6733]/10">
              <Image
                src={scoutLogo}
                alt=""
                width={28}
                height={28}
                draggable={false}
                className="h-7 w-7 object-contain"
              />
            </span>
            <div className="min-w-0 space-y-2">
              <p className="font-label text-[10px] font-medium uppercase tracking-[0.2em] text-[#FF6733]">
                One-time setup
              </p>
              <h2
                id="profile-prompt-title"
                className="font-headline text-xl font-medium tracking-[-0.02em] text-white sm:text-2xl"
              >
                Complete your profile so Scout can apply for you
              </h2>
            </div>
          </div>

          <p className="font-body text-sm leading-relaxed text-[#999]">
            Scout fills real application forms on your behalf — work authorization,
            contact info, locations, and more.{' '}
            <span className="text-white">
              You only need to do this once; after that, Scout handles the rest.
            </span>
          </p>

          <ul className="space-y-2 font-body text-sm text-[#888]">
            <li className="flex items-start gap-2">
              <Sparkles
                className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6733]"
                strokeWidth={1.75}
              />
              That&apos;s the goal of Scout: your profile powers every application.
            </li>
            <li className="flex items-start gap-2">
              <Sparkles
                className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6733]"
                strokeWidth={1.75}
              />
              Browse jobs and tailor resumes anytime — profile is required before
              Send Scout.
            </li>
          </ul>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleLater}
              className="inline-flex h-11 items-center justify-center rounded-full px-5 font-label text-sm font-medium text-[#888] transition-colors hover:text-white"
            >
              I&apos;ll do this later
            </button>
            <Link
              href="/profile"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#FF6733] px-6 font-label text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,103,51,0.35)] transition-all hover:shadow-[0_0_32px_rgba(255,103,51,0.5)] active:scale-[0.97]"
            >
              Complete profile
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}