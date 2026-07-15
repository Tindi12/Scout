'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Download, Loader2, Lock } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { JakeResumePreview } from '@/components/resume/JakeResumePreview'
import type { RewrittenResume } from '@/components/resume/RewriteResults'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
import { scoutLogo } from '@/lib/scout-logo'
import { normalizeRewrittenResume } from '@/lib/rewritten-resume'
import { cn } from '@/lib/utils'

type PanelStatus =
  | 'idle'
  | 'loading'
  | 'generating'
  | 'ready'
  | 'locked'
  | 'no_resume'
  | 'no_description'
  | 'error'

type JobCardTailoredPanelProps = {
  expanded: boolean
  jobId: string
  company: string
  resumeId: string | null
  isPro: boolean
  hasDescription: boolean
  onCached?: () => void
}

function variantResumeFromPayload(variant: unknown): RewrittenResume | null {
  if (!variant || typeof variant !== 'object') return null
  const row = variant as Record<string, unknown>
  return normalizeRewrittenResume(row.rewritten_resume)
}

async function readJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function messageFromLoadError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === 'INVALID_JSON') {
      return 'Server returned an invalid response. Try again in a moment.'
    }
    if (err.name === 'TypeError') {
      return 'Could not reach the app API. Run pnpm dev and keep the API running.'
    }
  }
  return 'Network error. Please try again.'
}

export function JobCardTailoredPanel({
  expanded,
  jobId,
  company,
  resumeId,
  isPro,
  hasDescription,
  onCached,
}: JobCardTailoredPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('idle')
  const [resume, setResume] = useState<RewrittenResume | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const fetchedKeyRef = useRef<string | null>(null)

  const loadVariant = useCallback(async () => {
    if (!resumeId) {
      setStatus('no_resume')
      return
    }
    if (!hasDescription) {
      setStatus('no_description')
      return
    }

    setStatus('loading')
    setErrorMessage('')
    setResume(null)

    try {
      const qs = new URLSearchParams({
        job_id: jobId,
        resume_id: resumeId,
      })
      const checkRes = await fetch(`/api/resume/variant?${qs}`, {
        cache: 'no-store',
      })
      if (!checkRes.ok) {
        setStatus('error')
        setErrorMessage('Could not load tailored resume.')
        return
      }

      const checkBody = (await readJsonResponse(checkRes)) as {
        cached?: boolean
        variant?: unknown
      }

      if (checkBody.cached && checkBody.variant) {
        const parsed = variantResumeFromPayload(checkBody.variant)
        if (parsed) {
          setResume(parsed)
          setStatus('ready')
          onCached?.()
          return
        }
      }

      if (!isPro) {
        setStatus('locked')
        return
      }

      setStatus('generating')
      const genRes = await fetch('/api/resume/generate-variant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, resume_id: resumeId }),
      })

      if (!genRes.ok) {
        let detail = 'Could not tailor resume for this job.'
        try {
          const err = (await genRes.json()) as { detail?: unknown }
          if (typeof err.detail === 'string') detail = err.detail
        } catch {
          /* keep default */
        }
        if (detail.toLowerCase().includes('no description')) {
          setStatus('no_description')
          return
        }
        setStatus('error')
        setErrorMessage(detail)
        return
      }

      const genBody = (await readJsonResponse(genRes)) as { variant?: unknown }
      const parsed = variantResumeFromPayload(genBody.variant)
      if (!parsed) {
        setStatus('error')
        setErrorMessage('Tailored resume was empty. Try again.')
        return
      }
      track(ANALYTICS_EVENTS.RESUME_TAILORED_FOR_JOB)
      setResume(parsed)
      setStatus('ready')
      onCached?.()
    } catch (err) {
      setStatus('error')
      setErrorMessage(messageFromLoadError(err))
    }
  }, [hasDescription, isPro, jobId, onCached, resumeId])

  useEffect(() => {
    if (!expanded) {
      fetchedKeyRef.current = null
      setStatus('idle')
      setResume(null)
      setErrorMessage('')
      return
    }

    const key = `${jobId}:${resumeId ?? ''}`
    if (fetchedKeyRef.current === key) return
    fetchedKeyRef.current = key
    void loadVariant()
  }, [expanded, jobId, loadVariant, resumeId])

  const handleDownloadPdf = async () => {
    if (!resumeId || !resume || pdfLoading) return
    setPdfLoading(true)
    try {
      const res = await fetch('/api/resume/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: resumeId,
          rewritten_resume: resume,
        }),
      })
      if (!res.ok) {
        setErrorMessage('Could not generate PDF.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${company.replace(/\s+/g, '_')}_Resume.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setErrorMessage('Network error generating PDF.')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <AnimatePresence initial={false}>
      {expanded ? (
        <motion.div
          key="tailored-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            {status === 'loading' || status === 'generating' ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span className="relative flex h-12 w-12 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/25" />
                  <Image
                    src={scoutLogo}
                    alt=""
                    width={32}
                    height={32}
                    draggable={false}
                    className="relative h-8 w-8 animate-pulse object-contain"
                  />
                </span>
                <p className="font-headline text-sm font-medium text-white">
                  {status === 'generating'
                    ? `Tailoring your resume for ${company}...`
                    : 'Loading tailored resume...'}
                </p>
                <div className="h-1 w-32 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                </div>
              </div>
            ) : null}

            {status === 'locked' ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-8 text-center">
                <Lock className="h-8 w-8 text-[#666]" strokeWidth={1.5} />
                <p className="font-headline text-sm font-medium text-white">
                  Pro feature — resume tailoring per job
                </p>
                <Link
                  href="/pricing"
                  className="font-label text-sm font-semibold text-[#FF6733] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Upgrade to Scout Pro
                </Link>
              </div>
            ) : null}

            {status === 'no_resume' ? (
              <p className="py-4 text-center font-body text-sm text-[#888]">
                Upload and analyze a resume to see job-specific tailoring.
              </p>
            ) : null}

            {status === 'no_description' ? (
              <p className="py-4 text-center font-body text-sm text-[#888]">
                No description available for this role — tailoring is not
                possible.
              </p>
            ) : null}

            {status === 'error' ? (
              <p className="py-4 text-center font-body text-sm text-[#ef4444]">
                {errorMessage || 'Something went wrong.'}
              </p>
            ) : null}

            {status === 'ready' && resume ? (
              <div className="flex flex-col gap-3">
                <div className="max-h-[400px] overflow-y-auto rounded-xl">
                  <JakeResumePreview resume={resume} compact />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDownloadPdf()
                  }}
                  disabled={pdfLoading}
                  className={cn(
                    'font-label inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] bg-white/[0.04] text-xs font-semibold text-white transition-colors duration-150 hover:bg-white/[0.08]',
                    pdfLoading && 'cursor-not-allowed opacity-70',
                  )}
                >
                  {pdfLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download PDF
                </button>
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
