'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ResumeUpload } from '@/components/resume/ResumeUpload'

const LAST_ANALYSIS_ID_KEY = 'scout:last_analysis_id'

export default function Page() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, user } = useUser()
  const [didRedirect, setDidRedirect] = useState(false)
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null)

  // ?new=1 forces the upload UI even if the user already has an analysis,
  // so the "Upload new" CTA on the dashboard always lands here.
  const forceNew = searchParams.get('new') === '1'

  useEffect(() => {
    if (!isLoaded) return
    if (!user?.id) return
    if (forceNew) return

    try {
      const lastId = window.localStorage.getItem(LAST_ANALYSIS_ID_KEY)
      if (lastId && lastId.trim()) {
        setDidRedirect(true)
        router.replace(`/resume/analysis?id=${encodeURIComponent(lastId.trim())}`)
      }
    } catch {
      // ignore
    }
  }, [isLoaded, user?.id, router, forceNew])

  useEffect(() => {
    if (!isLoaded) return
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/user/me', { method: 'GET', cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as { id?: string | null }
        if (!cancelled) setSupabaseUserId(body?.id ? String(body.id) : null)
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isLoaded, user?.id])

  if (!isLoaded) return null

  // If we are redirecting to the last analysis, avoid flashing the upload UI.
  if (didRedirect) return null

  if (!user?.id || !supabaseUserId) return null

  return (
    <div className="mx-auto w-full max-w-3xl py-10">
      <ResumeUpload userId={user.id} supabaseUserId={supabaseUserId} />
    </div>
  )
}
