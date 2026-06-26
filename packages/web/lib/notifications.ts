export type NotificationType =
  | 'application_failed'
  | 'application_needs_attention'
  | 'application_awaiting_code'
  | 'application_applied'
  | 'scout_run_finished'

export type NotificationRecord = {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  application_id: string | null
  scout_run_id: string | null
  read_at: string | null
  dismissed_at: string | null
  created_at: string
}

export type NotificationsListResponse = {
  notifications: NotificationRecord[]
  unread_count: number
  dismissed_application_ids: string[]
}

export const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { label: string; color: string }
> = {
  application_failed: { label: 'Failed', color: '#ef4444' },
  application_needs_attention: { label: 'Needs attention', color: '#f59e0b' },
  application_awaiting_code: { label: 'Code required', color: '#22d3ee' },
  application_applied: { label: 'Applied', color: '#22c55e' },
  scout_run_finished: { label: 'Run finished', color: '#a78bfa' },
}

export function notificationHref(notification: NotificationRecord): string {
  if (notification.scout_run_id) {
    return `/tracker?run_id=${encodeURIComponent(notification.scout_run_id)}`
  }
  return '/tracker'
}

export function isNotificationUnread(notification: NotificationRecord): boolean {
  return !notification.read_at && !notification.dismissed_at
}
