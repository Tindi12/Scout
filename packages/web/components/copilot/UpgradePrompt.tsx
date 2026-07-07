'use client'

import { ArrowRight, Check } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import type { LimitInfo } from '@/hooks/use-copilot-chat'
import { scoutLogo } from '@/lib/scout-logo'

/** Headline value props shown on the upgrade card. Mirrors the Pro column on the
 * pricing page so the pitch is consistent everywhere. */
const PRO_PERKS = [
  'Unlimited Scout Copilot — no daily cap',
  'Autonomous auto-apply via Scout Agent',
  'Job-specific resume rewrites in Jake format',
] as const

/**
 * Inline upgrade prompt shown in the chat thread when a free user hits their daily
 * Copilot limit. Laid out like an assistant turn (Scout avatar + card) so it reads as
 * part of the conversation, not an error. Shared by both Copilot surfaces.
 */
export function UpgradePrompt({ info }: { info: LimitInfo }) {
  const router = useRouter()

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#FF6733]/30 bg-primary/10">
        <Image
          src={scoutLogo}
          alt=""
          width={16}
          height={16}
          draggable={false}
          className="h-4 w-4 select-none object-contain"
        />
      </span>

      <div className="relative max-w-[88%] overflow-hidden rounded-2xl rounded-tl-sm border border-[#FF6733]/25 bg-primary/[0.04] p-4">
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6733]/30 bg-primary/10 px-2.5 py-1 font-label text-[11px] font-semibold uppercase tracking-wide text-[#FF8A5C]">
            Scout Pro
          </span>

          <p className="mt-3 font-display text-[15px] font-semibold leading-snug text-white">
            {info.message}
          </p>
          <p className="mt-1 font-body text-[13px] leading-relaxed text-[#A1A1AA]">
            Unlock the full agent and let Scout apply to internships for you.
          </p>

          <ul className="mt-3.5 space-y-2">
            {PRO_PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/15 ring-1 ring-inset ring-[#FF6733]/30">
                  <Check className="h-3 w-3 text-[#FF6733]" strokeWidth={3} />
                </span>
                <span className="font-body text-[13.5px] leading-snug text-[#e8e8e8]">
                  {perk}
                </span>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            onClick={() => router.push('/pricing')}
            className="group mt-4 text-[13px]"
          >
            Upgrade to {info.plan} — {info.price}
            <ArrowRight
              className="transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </Button>

          <p className="mt-2.5 font-body text-[11.5px] text-[#71717A]">
            Cancel anytime · Your free messages reset tomorrow
          </p>
        </div>
      </div>
    </div>
  )
}
