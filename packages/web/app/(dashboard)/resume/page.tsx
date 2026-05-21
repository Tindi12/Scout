'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ResumeUploadDashboardPrompt } from '@/components/resume/ResumeUploadDashboardPrompt'
import { RESUME_UPLOAD_SECTION_ID } from '@/lib/scroll-to-resume-upload'
import { Skeleton } from '@/components/ui/skeleton'

const LAST_ANALYSIS_ID_KEY = 'scout:last_analysis_id'

type AnalysesStatus = 'loading' | 'none' | 'has'

function resolveAnalysisRedirectId(
  analyses: ReadonlyArray<{ id: string }>,
): string | null {
  if (analyses.length === 0) return null

  const ownedIds = new Set(analyses.map((row) => row.id))
  const latestId = analyses[0]?.id?.trim()
  if (!latestId) return null

  try {
    const stored = window.localStorage.getItem(LAST_ANALYSIS_ID_KEY)?.trim()
    if (stored && ownedIds.has(stored)) return stored
    if (stored && !ownedIds.has(stored)) {
      window.localStorage.removeItem(LAST_ANALYSIS_ID_KEY)
    }
  } catch {
    // ignore
  }

  return latestId
}

export default function Page() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, user } = useUser()
  const [didRedirect, setDidRedirect] = useState(false)
  const [analysesStatus, setAnalysesStatus] = useState<AnalysesStatus>('loading')
  const [analyses, setAnalyses] = useState<Array<{ id: string }>>([])

  useEffect(() => {
    if (!isLoaded) return
    if (searchParams.get('new') === '1') {
      router.replace(`/dashboard#${RESUME_UPLOAD_SECTION_ID}`)
    }
  }, [isLoaded, searchParams, router])

  useEffect(() => {
    if (!isLoaded) return
    if (!user?.id) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/resume/analyses?limit=5', {
          method: 'GET',
          cache: 'no-store',
        })
        if (cancelled) return
        if (!res.ok) {
          setAnalyses([])
          setAnalysesStatus('none')
          return
        }
        const body = (await res.json()) as { analyses?: Array<{ id: string }> }
        const rows = Array.isArray(body.analyses) ? body.analyses : []
        setAnalyses(rows)
        setAnalysesStatus(rows.length > 0 ? 'has' : 'none')
      } catch {
        if (!cancelled) {
          setAnalyses([])
          setAnalysesStatus('none')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isLoaded, user?.id])

  useEffect(() => {
    if (!isLoaded || !user?.id || analysesStatus !== 'has') return

    const analysisId = resolveAnalysisRedirectId(analyses)
    if (!analysisId) return

    setDidRedirect(true)
    try {
      window.localStorage.setItem(LAST_ANALYSIS_ID_KEY, analysisId)
    } catch {
      // ignore
    }
    router.replace(
      `/resume/analysis?id=${encodeURIComponent(analysisId)}`,
    )
  }, [isLoaded, user?.id, router, analysesStatus, analyses])

  if (!isLoaded || analysesStatus === 'loading') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  if (didRedirect) return null

  if (analysesStatus === 'has') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-10">
      <ResumeUploadDashboardPrompt />
    </div>
  )
}
