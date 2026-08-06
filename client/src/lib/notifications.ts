import { apiRequest } from './api'
import type { Recurrence } from './tasks'

/**
 * An in-app notification (#366). `data` is the server's JSON snapshot taken at
 * insert time — for 'recurring_activated' it carries the task title and the
 * rule, so the message renders even after the task itself is deleted
 * (`taskId` goes null then; the row link just drops).
 */
export type AppNotification = {
  id: number
  /** 'recurring_activated' in v1; later types slot in as new strings. */
  type: string
  taskId: number | null
  data: { title?: string; recurrence?: Recurrence }
  createdAt: string
  readAt: string | null
}

export type NotificationsPayload = {
  notifications: AppNotification[]
  unreadCount: number
}

/**
 * The caller's notifications, newest first (server-bounded), + unread count.
 * The GET itself runs the lazy activation sweep server-side — fetching IS how
 * "your recurring task came back" gets discovered on this no-daemon hosting.
 */
export function fetchNotifications(): Promise<NotificationsPayload> {
  return apiRequest<NotificationsPayload>('/notifications')
}

/** Mark ALL notifications read (v1 model — opening the view clears the badge). */
export async function markNotificationsRead(): Promise<void> {
  await apiRequest('/notifications/read', { method: 'POST' })
}

/**
 * Human label for a recurrence rule — the TaskView Repeat vocabulary (#250),
 * lowercased mid-sentence: "daily", "weekly", "every 2 weeks", "monthly on
 * day 15", "every 3 days". One source so notifications never invent a phrasing.
 */
export function recurrenceLabel(rec: Recurrence): string {
  if ('dayOfMonth' in rec) return `monthly on day ${rec.dayOfMonth}`
  if (rec.interval === 1) {
    return rec.unit === 'day' ? 'daily' : rec.unit === 'week' ? 'weekly' : 'monthly'
  }
  return `every ${rec.interval} ${rec.unit}s`
}
