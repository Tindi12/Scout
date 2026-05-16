'use client'

import Image from 'next/image'
import Link from 'next/link'

import { scoutLogo } from '@/lib/scout-logo'
import { usePathname } from 'next/navigation'

export function CopilotBubble() {
  const pathname = usePathname()

  // Hide on the copilot page itself.
  if (pathname?.startsWith('/copilot')) return null

  return (
    <Link
      href="/copilot"
      aria-label="Ask Scout"
      className="group fixed bottom-24 right-5 z-40 inline-flex h-14 items-center gap-0 overflow-hidden rounded-full border border-[#FF6733]/40 bg-[#FF6733] pl-2 pr-2 shadow-[0_0_28px_rgba(255,103,51,0.45)] transition-all duration-300 hover:pr-5 hover:shadow-[0_0_36px_rgba(255,103,51,0.65)] active:scale-[0.97] md:bottom-6 md:right-6"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20">
        <Image
          src={scoutLogo}
          alt=""
          width={28}
          height={28}
          draggable={false}
          className="h-7 w-7 select-none object-contain"
        />
      </span>
      <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap font-label text-sm font-semibold text-white opacity-0 transition-all duration-300 group-hover:ml-2 group-hover:max-w-[140px] group-hover:opacity-100">
        Ask Scout
      </span>
    </Link>
  )
}
