'use client'

import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotificationsContext } from '@/contexts/notifications-context'
import { ANALYTICS_EVENTS, track } from '@/lib/analytics'
import {
  isNotificationUnread,
  NOTIFICATION_TYPE_META,
  notificationHref,
  type NotificationRecord,
} from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/components/tracker/tracker-utils'

export function NotificationBell() {
  const router = useRouter()
  const {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    dismiss,
  } = useNotificationsContext()

  const handleOpenRow = async (notification: NotificationRecord) => {
    track(ANALYTICS_EVENTS.NOTIFICATION_CLICKED, {
      notification_type: notification.type,
    })
    if (isNotificationUnread(notification)) {
      await markRead(notification.id)
    }
    router.push(notificationHref(notification))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-[#888] transition-colors hover:border-white/[0.12] hover:text-white data-[state=open]:border-white/[0.12] data-[state=open]:text-white"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          {unreadCount > 0 ? (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.7)]"
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(100vw-2rem,22rem)] border border-white/[0.08] bg-[#0c0c0c] p-0 text-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="font-label text-sm font-semibold text-white">
            Notifications
          </p>
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
            className="font-label text-xs text-[#888] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mark all as read
          </button>
        </div>

        <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <p className="px-4 py-8 text-center font-label text-sm text-[#555]">
              Loading…
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-8 text-center font-label text-sm text-[#555]">
              You&apos;re all caught up
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={() => void handleOpenRow(notification)}
                  onDismiss={() =>
                    void dismiss(
                      notification.id,
                      notification.application_id,
                    )
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationRow({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: NotificationRecord
  onOpen: () => void
  onDismiss: () => void
}) {
  const meta = NOTIFICATION_TYPE_META[notification.type]
  const unread = isNotificationUnread(notification)

  return (
    <li
      className={cn(
        'group flex gap-2 px-3 py-3 transition-colors',
        unread ? 'bg-white/[0.03]' : 'bg-transparent',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-start gap-2.5">
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: meta.color }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-label text-sm font-medium text-white">
              {notification.title}
            </p>
            {notification.body ? (
              <p className="mt-0.5 line-clamp-2 font-label text-xs text-[#666]">
                {notification.body}
              </p>
            ) : null}
            <p className="mt-1 font-mono text-[10px] text-[#444]">
              {formatRelativeTime(notification.created_at)}
            </p>
          </div>
        </div>
      </button>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#555] opacity-0 transition-all hover:bg-white/[0.06] hover:text-white group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </li>
  )
}
