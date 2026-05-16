'use client'

import { Info } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function CoverLetterOpeningInfo() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 cursor-help items-center justify-center rounded-full text-[#555] transition-colors hover:text-[#FF6733] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6733]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808]"
            aria-label="How the default cover letter opening works"
          >
            <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className="max-w-[300px] border border-white/10 bg-[#111] px-4 py-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
        >
          <p className="font-label text-xs font-medium text-white">
            How this works
          </p>
          <ul className="mt-2 space-y-2 text-xs leading-relaxed text-[#aaa]">
            <li>
              Write a short opening in your own voice (up to 300 characters)—not
              a full cover letter, just how you&apos;d start when a form asks
              &ldquo;Why are you interested?&rdquo; or for a cover letter box.
            </li>
            <li>
              Use placeholders Scout fills in per job:{' '}
              <span className="font-mono text-[10px] text-[#888]">
                {'{role}'}, {'{company}'}, {'{year}'}, {'{degree}'}, {'{major}'},{' '}
                {'{school}'}
              </span>
              .
            </li>
            <li>
              When Scout applies for you, it swaps those for the real job title,
              company, graduation year, degree, major, and school so each
              application sounds tailored without retyping.
            </li>
          </ul>
          <p className="mt-3 border-t border-white/[0.06] pt-2 font-mono text-[10px] leading-relaxed text-[#666]">
            Example: I am excited to apply for the {'{role}'} position at{' '}
            {'{company}'}. As a {'{year}'} {'{degree}'} student in {'{major}'}{' '}
            at {'{school}'}...
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
