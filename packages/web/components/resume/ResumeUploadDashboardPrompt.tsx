import Link from 'next/link'
import { ArrowRight, FileText } from 'lucide-react'

import { RESUME_UPLOAD_SECTION_ID } from '@/lib/scroll-to-resume-upload'

export function ResumeUploadDashboardPrompt() {
  return (
    <div className="glass-card mx-auto w-full max-w-lg rounded-2xl border border-white/[0.06] p-6 md:p-8">
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#FF6733]/30 bg-[#FF6733]/10">
          <FileText className="h-7 w-7 text-[#FF6733]" strokeWidth={1.5} />
        </span>
        <div className="space-y-2">
          <h1 className="font-headline text-2xl font-medium tracking-[-0.02em] text-white">
            Upload your resume on the dashboard
          </h1>
          <p className="font-body text-sm leading-relaxed text-[#888]">
            Upload and score your resume on the dashboard. This page is for
            analysis, breakdowns, and rewrites after your first upload.
          </p>
        </div>
        <Link
          href={`/dashboard#${RESUME_UPLOAD_SECTION_ID}`}
          className="inline-flex items-center gap-2 rounded-full bg-[#FF6733] px-6 py-2.5 font-label text-sm font-semibold text-white transition-all active:scale-[0.97]"
        >
          Go to dashboard
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
        </Link>
      </div>
    </div>
  )
}
