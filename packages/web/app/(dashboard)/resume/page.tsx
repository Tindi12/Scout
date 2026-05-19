'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ResumeUploadDashboardPrompt } from '@/components/resume/ResumeUploadDashboardPrompt'
import { RESUME_UPLOAD_SECTION_ID } from '@/lib/scroll-to-resume-upload'
import { Skeleton } from '@/components/ui/skeleton'

const LAST_ANALYSIS_ID_KEY = 'scout:last_analysis_id'

type AnalysesStatus = 'loading' | 'none' | 'has'

export default function Page() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, user } = useUser()
  const [didRedirect, setDidRedirect] = useState(false)
  const [analysesStatus, setAnalysesStatus] = useState<AnalysesStatus>('loading')

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
        const res = await fetch('/api/resume/analyses?limit=1', {
          method: 'GET',
          cache: 'no-store',
        })
        if (cancelled) return
        if (!res.ok) {
          setAnalysesStatus('none')
          return
        }
        const body = (await res.json()) as { analyses?: Array<{ id: string }> }
        const rows = Array.isArray(body.analyses) ? body.analyses : []
        setAnalysesStatus(rows.length > 0 ? 'has' : 'none')
      } catch {
        if (!cancelled) setAnalysesStatus('none')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isLoaded, user?.id])

  useEffect(() => {
    if (!isLoaded || !user?.id || analysesStatus !== 'has') return

    let cancelled = false
    void (async () => {
      let analysisId: string | null = null
      try {
        analysisId = window.localStorage.getItem(LAST_ANALYSIS_ID_KEY)
      } catch {
        // ignore
      }

      if (!analysisId?.trim()) {
        try {
          const res = await fetch('/api/resume/analyses?limit=1', {
            cache: 'no-store',
          })
          if (res.ok) {
            const body = (await res.json()) as {
              analyses?: Array<{ id: string }>
            }
            analysisId = body.analyses?.[0]?.id ?? null
          }
        } catch {
          // ignore
        }
      }

      if (cancelled || !analysisId?.trim()) return
      setDidRedirect(true)
      router.replace(
        `/resume/analysis?id=${encodeURIComponent(analysisId.trim())}`,
      )
    })()

    return () => {
      cancelled = true
    }
  }, [isLoaded, user?.id, router, analysesStatus])

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
