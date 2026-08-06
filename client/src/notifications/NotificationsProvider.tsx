import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import {
  fetchNotifications,
  markNotificationsRead,
  type AppNotification,
} from '@/lib/notifications'
import { NotificationsContext } from './notificationsContext'

/**
 * Tracks the user's notifications (#366) for the header avatar dot + the
 * /notifications view. Same freshness rule as InProgressProvider: fetch on
 * mount and on route change, never a poll — and the fetch is what triggers the
 * server's lazy activation sweep, so "opening the app" is when recurring
 * arrivals surface.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const { notifications, unreadCount } = await fetchNotifications()
      setNotifications(notifications)
      setUnreadCount(unreadCount)
    } catch {
      // Non-blocking chrome — keep the last-known state on a transient failure.
      // (A 401 is handled globally by apiRequest → redirect.)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [pathname, refresh])

  const markAllRead = useCallback(async () => {
    try {
      await markNotificationsRead()
      // Zero the badge immediately; the LIST keeps this render's readAt flags
      // so the view's unread styling survives until the next visit.
      setUnreadCount(0)
    } catch {
      // Badge stays — the next open retries.
    }
  }, [])

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, refresh, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  )
}
