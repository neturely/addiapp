import { createContext } from 'react'
import type { AppNotification } from '@/lib/notifications'

export type NotificationsContextValue = {
  /** Newest-first list from the last fetch (server-bounded). */
  notifications: AppNotification[]
  /** Unread count — escalates the header badge from green to red. */
  unreadCount: number
  /** All non-dismissed notifications — the badge's presence + the menu count. */
  totalCount: number
  /** Re-fetch (runs the server-side activation sweep). */
  refresh: () => Promise<void>
  /** Mark everything read (v1 model) and zero the local count. */
  markAllRead: () => Promise<void>
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null)
