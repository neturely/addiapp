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
 * poll — and keeps ALL running tasks, most-recently-started first (tasks run in
 * parallel on their own timers, #256 review). `refresh()` covers the case with no
 * navigation (e.g. completing on the InProgress screen renders in place). The
 * per-second ticking is done client-side by the chip off `startedAt`, never here.
 */
export function InProgressProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [activeTasks, setActiveTasks] = useState<Task[]>([])

  const refresh = useCallback(async () => {
    try {
      const tasks = await fetchTasks('in_progress')
      // Parallel running tasks (#256 review): keep them ALL, most recent first.
      setActiveTasks([...tasks].sort((a, b) => startedMs(b) - startedMs(a)))
    } catch {
      // Non-blocking chrome — keep the last-known chip on a transient failure.
      // (A 401 is handled globally by apiRequest → redirect.)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [pathname, refresh])

  return (
    <InProgressContext.Provider value={{ activeTask: activeTasks[0] ?? null, activeTasks, refresh }}>
      {children}
    </InProgressContext.Provider>
  )
}
