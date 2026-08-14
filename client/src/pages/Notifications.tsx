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
import { useErrorReporter } from '@/toast/useErrorReporter'
import { friendlyMessage } from '@/lib/apiError'
import { Mascot } from '@/components/Mascot'
import { Loading } from '@/components/Loading'
import { ErrorBanner } from '@/components/ErrorBanner'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'

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

/** "3×" from the overrun snapshot (#403) — whole multiples read cleaner than
 * exact minutes, and the snapshot is a detection-moment figure anyway. */
function overRatio(n: AppNotification): string {
  const est = n.data.estimatedMinutes ?? 0
  const elapsed = n.data.elapsedMinutes ?? 0
  return est > 0 ? `${Math.floor(elapsed / est)}×` : 'way'
}

/** Per-type message, split for the row's bold-lead styling (the Dashboard's
 * "Title Description" treatment); new types add branches here. */
function messageParts(n: AppNotification): { lead: string; rest: string } {
  const lead = n.data.title ?? 'A task'
  if (n.type === 'recurring_activated') {
    return {
      lead,
      rest: n.data.recurrence
        ? ` was added — repeats ${recurrenceLabel(n.data.recurrence)}.`
        : ' was added.',
    }
  }
  // #403 stage 1: still running, warn before the 5× auto-return.
  if (n.type === 'task_overrun') {
    return {
      lead,
      rest: ` is ${overRatio(n)} over its ${n.data.estimatedMinutes ?? '?'} min estimate — still on it? It goes back to Ready at ${n.data.returnRatio ?? 5}×.`,
    }
  }
  // #403 stage 2: the sweep sent it back to Ready.
  if (n.type === 'task_returned') {
    return {
      lead,
      rest: ` was sent back to Ready — it ran ${overRatio(n)} over its ${n.data.estimatedMinutes ?? '?'} min estimate.`,
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
  const reportError = useErrorReporter()
  const { markAllRead, refresh } = useNotifications()
  const [list, setList] = useState<AppNotification[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // #421: a row opens this detail modal (full untruncated text); the navigation
  // the row used to perform moved to the modal's "Go to task" button.
  const [detail, setDetail] = useState<AppNotification | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Only a FAILED FETCH may empty the list — the follow-up read-state sync
      // must never wipe successfully fetched rows (its helpers swallow their
      // own errors today; the split keeps that guarantee structural).
      let fetched: AppNotification[]
      try {
        ;({ notifications: fetched } = await fetchNotifications())
      } catch (e) {
        // Don't let a failure masquerade as the empty state (#415 round 2): the
        // list stays null and the body below is suppressed, so the banner is
        // the only thing rendered (setting it to [] showed "Nothing yet").
        if (!cancelled) setLoadError(friendlyMessage(e, "your notifications didn't load"))
        return
      }
      if (cancelled) return
      setList(fetched)
      await markAllRead()
      await refresh()
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
    } catch (e) {
      setList((l) => {
        if (!l) return l
        const restored = [...l, n]
        restored.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
        return restored
      })
      reportError(e, "the notification wasn't dismissed")
    }
  }

  return (
    <main className="flex min-h-screen w-full flex-col p-4 sm:p-6">
      <h1 className="sr-only">Notifications</h1>
      {loadError && <ErrorBanner message={loadError} />}
      <div className="mb-2.5 flex items-center gap-2.5 px-1 text-xs text-muted">
        Notifications
      </div>

      {loadError ? null : list === null ? (
        <Loading />
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
                  onClick={() => setDetail(n)}
                  aria-label={`View notification: ${lead}`}
                  className="flex h-full min-w-0 flex-1 items-center gap-3.5 pl-3.5 pr-5 text-left"
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
                  className="mr-3 inline-flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted transition hover:bg-field-hover hover:text-gray-700 sm:h-9 sm:w-9"
                >
                  <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Detail modal (#421) — shared Modal primitive (#218): focus trap,
          Escape/backdrop close, return-focus to the opening row. A deleted
          task's notification has taskId null → no "Go to task". */}
      {detail && (
        <Modal titleId="notification-detail-title" onClose={() => setDetail(null)}>
          <h2
            id="notification-detail-title"
            className="text-lg font-bold leading-snug text-gray-900"
          >
            {messageParts(detail).lead}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-800">
            {messageParts(detail).lead}
            {messageParts(detail).rest}
          </p>
          {/* The date sits bottom-left, on the button row's baseline (user
              feedback) — it's metadata, not a subtitle under the heading. */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{dayLabel(detail.createdAt)}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setDetail(null)}>
                OK
              </Button>
              {detail.taskId !== null && (
                <Button onClick={() => navigate(`/tasks/${detail.taskId}`)}>Go to task</Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </main>
  )
}
