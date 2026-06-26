'use client'

import { useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  NotificationRecord,
  NotificationsListResponse,
} from '@/lib/notifications'

const POLL_MS = 15_000

export function useNotifications() {
  const { user } = useUser()
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [dismissedApplicationIds, setDismissedApplicationIds] = useState<
    Set<string>
  >(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const applyPayload = useCallback((body: NotificationsListResponse) => {
    setNotifications(body.notifications ?? [])
    setUnreadCount(body.unread_count ?? 0)
    setDismissedApplicationIds(new Set(body.dismissed_application_ids ?? []))
  }, [])

  const refetch = useCallback(async () => {
    if (!user?.id) {
      setNotifications([])
      setUnreadCount(0)
      setDismissedApplicationIds(new Set())
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) {
        if (mountedRef.current) setError('Failed to load notifications')
        return
      }
      const body = (await res.json()) as NotificationsListResponse
      if (mountedRef.current) {
        applyPayload(body)
        setError(null)
      }
    } catch {
      if (mountedRef.current) setError('Failed to load notifications')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [applyPayload, user?.id])

  useEffect(() => {
    void refetch()
    if (!user?.id) return
    const id = setInterval(() => void refetch(), POLL_MS)
    return () => clearInterval(id)
  }, [refetch, user?.id])

  const markRead = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, read_at: n.read_at ?? new Date().toISOString() }
            : n,
        ),
      )
      setUnreadCount((c) => Math.max(0, c - 1))

      try {
        const res = await fetch(
          `/api/notifications/${encodeURIComponent(notificationId)}/read`,
          { method: 'PATCH' },
        )
        if (!res.ok) {
          await refetch()
          return
        }
        await refetch()
      } catch {
        await refetch()
      }
    },
    [refetch],
  )

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? now })),
    )
    setUnreadCount(0)

    try {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
      })
      if (!res.ok) {
        await refetch()
        return
      }
      await refetch()
    } catch {
      await refetch()
    }
  }, [refetch])

  const dismiss = useCallback(
    async (notificationId: string, applicationId?: string | null) => {
      const now = new Date().toISOString()
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
      setUnreadCount((c) => {
        const item = notifications.find((n) => n.id === notificationId)
        if (item && !item.read_at) return Math.max(0, c - 1)
        return c
      })
      if (applicationId) {
        setDismissedApplicationIds((prev) => new Set(prev).add(applicationId))
      }

      try {
        const res = await fetch(
          `/api/notifications/${encodeURIComponent(notificationId)}/dismiss`,
          { method: 'PATCH' },
        )
        if (!res.ok) {
          await refetch()
          return
        }
        await refetch()
      } catch {
        await refetch()
      }
    },
    [notifications, refetch],
  )

  const dismissForApplication = useCallback(
    async (applicationId: string) => {
      const match = notifications.find(
        (n) => n.application_id === applicationId,
      )
      if (match) {
        await dismiss(match.id, applicationId)
        return
      }

      setDismissedApplicationIds((prev) => new Set(prev).add(applicationId))
      try {
        const res = await fetch(
          `/api/notifications/by-application/${encodeURIComponent(applicationId)}/dismiss`,
          { method: 'PATCH' },
        )
        if (!res.ok) {
          await refetch()
          return
        }
        await refetch()
      } catch {
        await refetch()
      }
    },
    [dismiss, notifications, refetch],
  )

  const notificationByApplicationId = useMemo(() => {
    const map = new Map<string, NotificationRecord>()
    for (const n of notifications) {
      if (n.application_id) map.set(n.application_id, n)
    }
    return map
  }, [notifications])

  const isApplicationDismissed = useCallback(
    (applicationId: string) => dismissedApplicationIds.has(applicationId),
    [dismissedApplicationIds],
  )

  return {
    notifications,
    unreadCount,
    loading,
    error,
    notificationByApplicationId,
    dismissedApplicationIds,
    isApplicationDismissed,
    refetch,
    markRead,
    markAllRead,
    dismiss,
    dismissForApplication,
  }
}
