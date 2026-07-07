import Link from 'next/link'
import { ArrowRight, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
        <Button asChild>
          <Link href={`/dashboard#${RESUME_UPLOAD_SECTION_ID}`}>
            Go to dashboard
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </Link>
        </Button>
      </div>
    </div>
  )
}
