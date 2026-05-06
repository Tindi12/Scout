'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ResumeUpload } from '@/components/resume/ResumeUpload'

const LAST_ANALYSIS_ID_KEY = 'scout:last_analysis_id'

export default function Page() {
  const router = useRouter()
  const { isLoaded, user } = useUser()
  const [didRedirect, setDidRedirect] = useState(false)
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (!user?.id) return

    try {
      const lastId = window.localStorage.getItem(LAST_ANALYSIS_ID_KEY)
      if (lastId && lastId.trim()) {
        setDidRedirect(true)
        router.replace(`/resume/analysis?id=${encodeURIComponent(lastId.trim())}`)
      }
    } catch {
      // ignore
    }
  }, [isLoaded, user?.id, router])

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
