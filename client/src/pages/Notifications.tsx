import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { X } from 'lucide-react'
import {
  dismissNotification,
  fetchNotifications,
  recurrenceLabel,
  type AppNotification,
} from '@/lib/notifications'
import { useNotifications } from '@/notifications/useNotifications'
import { useToast } from '@/toast/useToast'
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

/** Per-type message, split for the row's bold-lead styling (the Dashboard's
 * "Title Description" treatment); new types add branches here. */
function messageParts(n: AppNotification): { lead: string; rest: string } {
  if (n.type === 'recurring_activated') {
    const lead = n.data.title ?? 'A task'
    return {
      lead,
      rest: n.data.recurrence
        ? ` was added — repeats ${recurrenceLabel(n.data.recurrence)}.`
        : ' was added.',
    }
  }
  return { lead: n.data.title ?? 'Notification', rest: '' }
}

/**
 * The notifications view (#366) — reached from the avatar menu, styled as the
 * Dashboard's row list (user feedback): surface rows, leading unread dot in
 * the pole cell, bold-lead message, date cell, trailing dismiss action.
 * Opening marks everything read (v1 decision). The page does its OWN fetch and
 * renders that snapshot's readAt flags — deliberately not the provider's list,
 * which refetches on the route change and would race the mark-read into
 * stripping the unread styling mid-visit. Order: fetch → render → mark read →
 * provider refresh (so the badge converges on the server's post-mark zero).
 */
export function Notifications() {
  const navigate = useNavigate()
  const { showToast } = useToast()
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

  // Optimistic dismiss: the row leaves immediately, restore on failure.
  async function dismiss(n: AppNotification) {
    setList((l) => (l ? l.filter((x) => x.id !== n.id) : l))
    try {
      await dismissNotification(n.id)
      void refresh()
    } catch {
      setList((l) => {
        if (!l) return l
        const restored = [...l, n]
        restored.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
        return restored
      })
      showToast({ message: 'Could not dismiss the notification.', tone: 'warning' })
    }
  }

  return (
    <main className="flex min-h-screen w-full flex-col p-4 sm:p-6">
      <h1 className="sr-only">Notifications</h1>
      <div className="mb-2.5 flex items-center gap-2.5 px-1 text-xs text-muted">
        Notifications
      </div>

      {list === null ? (
        <p role="status" className="px-1 text-sm text-muted">
          Loading…
        </p>
      ) : list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          {/* Shared "nothing to see here" mascot treatment (#256 review). */}
          <Mascot expression="empty" className="mx-auto mb-4 h-20 w-20" />
          <p className="text-muted">
            Nothing yet — when a recurring task comes back, you’ll hear about it here.
          </p>
        </div>
      ) : (
        <ul aria-label="Notifications" className="flex flex-col gap-px">
          {list.map((n, i) => {
            const unread = n.readAt === null
            const { lead, rest } = messageParts(n)
            return (
              <li
                key={n.id}
                className={`group flex h-12 items-center bg-surface transition hover:bg-[#fbf8f3] ${
                  i === 0 ? 'rounded-t-xl' : ''
                } ${i === list.length - 1 ? 'rounded-b-xl' : ''}`}
              >
                {/* Leading dot cell — the Dashboard's pole slot, carrying the
                    unread state instead of a project colour. */}
                <span className="ml-5 flex h-full w-2 flex-none items-center">
                  <span
                    className={`h-2 w-2 rounded-full ${unread ? 'bg-primary' : 'bg-gray-300'}`}
                    aria-hidden
                  />
                </span>
                <button
                  type="button"
                  onClick={() => n.taskId !== null && navigate(`/tasks/${n.taskId}`)}
                  aria-label={n.taskId !== null ? `Open ${lead}` : lead}
                  className={`flex h-full min-w-0 flex-1 items-center gap-3.5 pl-3.5 pr-5 text-left ${
                    n.taskId !== null ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span
                      className={`font-semibold ${unread ? 'text-gray-900' : 'text-gray-800'}`}
                    >
                      {lead}
                    </span>
                    <span className="text-muted">{rest}</span>
                  </span>
                  <span className="flex-none text-xs tabular-nums text-muted">
                    {dayLabel(n.createdAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void dismiss(n)}
                  aria-label={`Dismiss notification: ${lead}`}
                  className="mr-3 inline-flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-lg text-muted transition hover:bg-field-hover hover:text-gray-700 sm:h-9 sm:w-9"
                >
                  <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
