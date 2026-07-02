'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { useToast } from '@/hooks/use-toast'

/**
 * After Composio OAuth, finalize the pending mail connection and strip the query
 * param. Mounted in the dashboard shell so onboarding returns land cleanly.
 */
export function MailOAuthReturnSync() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    if (searchParams.get('mail_connected') !== '1') return
    handled.current = true

    void (async () => {
      try {
        const res = await fetch('/api/user/mail-connection', { cache: 'no-store' })
        if (res.ok) {
          const data = (await res.json()) as { connected?: boolean }
          if (data.connected) {
            toast({
              title: 'Email connected',
              description: 'Scout can now pick up verification codes automatically.',
              duration: 3200,
            })
          }
        }
      } catch {
        // Non-blocking — user is already on the dashboard.
      } finally {
        router.replace(pathname)
      }
    })()
  }, [pathname, router, searchParams, toast])

  return null
}
