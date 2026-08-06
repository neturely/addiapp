import { createContext } from 'react'
import type { AppNotification } from '@/lib/notifications'

export type NotificationsContextValue = {
  /** Newest-first list from the last fetch (server-bounded). */
  notifications: AppNotification[]
  /** Unread total — drives the header avatar dot and the menu count. */
  unreadCount: number
  /** Re-fetch (runs the server-side activation sweep). */
  refresh: () => Promise<void>
  /** Mark everything read (v1 model) and zero the local count. */
  markAllRead: () => Promise<void>
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null)
