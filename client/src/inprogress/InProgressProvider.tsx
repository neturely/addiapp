import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { fetchTasks, type Task } from '@/lib/tasks'
import { InProgressContext } from './inProgressContext'

/** startedAt in ms for "most recently started"; unset sorts oldest. */
function startedMs(t: Task): number {
  return t.startedAt ? Date.parse(t.startedAt) : 0
}

/**
 * Tracks the user's currently in-progress task for the header timer chip (#135).
 * Wraps the authed shell (AppLayout). Fetches the in-progress list on mount and
 * on every route change — one indexed `GET /api/tasks?status=in_progress`, NOT a
 * poll — and picks the most-recently-started. `refresh()` covers the case with no
 * navigation (e.g. completing on the InProgress screen renders in place). The
 * per-second ticking is done client-side by the chip off `startedAt`, never here.
 */
export function InProgressProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const refresh = useCallback(async () => {
    try {
      const tasks = await fetchTasks('in_progress')
      const mostRecent = tasks.reduce<Task | null>(
        (best, t) => (best === null || startedMs(t) > startedMs(best) ? t : best),
        null,
      )
      setActiveTask(mostRecent)
    } catch {
      // Non-blocking chrome — keep the last-known chip on a transient failure.
      // (A 401 is handled globally by apiRequest → redirect.)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [pathname, refresh])

  return (
    <InProgressContext.Provider value={{ activeTask, refresh }}>
      {children}
    </InProgressContext.Provider>
  )
}
