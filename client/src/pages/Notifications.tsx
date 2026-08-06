import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Repeat } from 'lucide-react'
import {
  fetchNotifications,
  recurrenceLabel,
  type AppNotification,
} from '@/lib/notifications'
import { useNotifications } from '@/notifications/useNotifications'
import { Mascot } from '@/components/Mascot'

/** '2026-08-06T…' → "Today" / "Yesterday" / "Aug 4" (dates, not clock time —
 * a recurring activation happens at midnight, hours would read as noise). */
function dayLabel(iso: string): string {
  const then = new Date(iso)
  const now = new Date()
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) /
      86_400_000,
  )
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return then.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

/** Per-type message; new types add branches here (the server only snapshots data). */
function messageFor(n: AppNotification): string {
  if (n.type === 'recurring_activated') {
    const title = n.data.title ?? 'A task'
    return n.data.recurrence
      ? `${title} was added — repeats ${recurrenceLabel(n.data.recurrence)}.`
      : `${title} was added.`
  }
  return n.data.title ?? 'Notification'
}

/**
 * The notifications view (#366) — reached from the avatar menu. Opening marks
 * everything read (v1 decision). The page does its OWN fetch and renders that
 * snapshot's readAt flags — deliberately not the provider's list, which
 * refetches on the route change and would race the mark-read into stripping
 * the unread tint mid-visit. Order: fetch → render → mark read → provider
 * refresh (so the badge converges on the server's post-mark zero).
 */
export function Notifications() {
  const { markAllRead, refresh } = useNotifications()
  const [list, setList] = useState<AppNotification[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { notifications } = await fetchNotifications()
        if (cancelled) return
        setList(notifications)
        await markAllRead()
        await refresh()
      } catch {
        if (!cancelled) setList([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [markAllRead, refresh])

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="mb-4 px-1 text-lg font-bold text-gray-900">Notifications</h1>

      {list === null ? (
        <p role="status" className="px-1 text-sm text-muted">
          Loading…
        </p>
      ) : list.length === 0 ? (
        <div className="py-16 text-center">
          {/* Shared "nothing to see here" mascot treatment (#256 review). */}
          <Mascot expression="empty" className="mx-auto mb-4 h-20 w-20" />
          <p className="text-muted">
            Nothing yet — when a recurring task comes back, you’ll hear about it here.
          </p>
        </div>
      ) : (
        <ul aria-label="Notifications" className="flex flex-col gap-1">
          {list.map((n) => {
            const unread = n.readAt === null
            const body = (
              <>
                <span
                  className={`mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                    unread ? 'bg-primary-tint text-primary-ink' : 'bg-field text-muted'
                  }`}
                  aria-hidden
                >
                  <Repeat className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm ${unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                  >
                    {messageFor(n)}
                  </span>
                  <span className="block text-xs text-muted">{dayLabel(n.createdAt)}</span>
                </span>
              </>
            )
            const rowClass = `flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${
              unread ? 'bg-primary-tint/40' : ''
            }`
            return (
              <li key={n.id}>
                {n.taskId !== null ? (
                  <Link to={`/tasks/${n.taskId}`} className={`${rowClass} transition hover:bg-page`}>
                    {body}
                  </Link>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
