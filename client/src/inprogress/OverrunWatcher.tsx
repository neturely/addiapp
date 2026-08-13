import { useEffect, useRef, useState } from 'react'
import { useInProgress } from './useInProgress'
import { useNotifications } from '@/notifications/useNotifications'
import { fetchPoints } from '@/lib/points'

/** Fire slightly after the boundary so the server (whose clock decides) has
 * crossed it too before the sweep runs. */
const GRACE_MS = 2000
/** setTimeout's max delay (~24.8 days) — a boundary beyond it is unreachable
 * in a session and would overflow into an immediate fire. */
const MAX_DELAY_MS = 2 ** 31 - 1

/**
 * Client-side liveness for the #403 overrun boundaries (#423, tier 1 — local
 * boundary detection, NOT polling). The client already knows each running
 * task's `startedAt` and the served warn/return ratios, so the two crossings
 * are deterministic moments: one timer per (task, run, stage) fires THEN —
 * a notifications refresh (which triggers the server's lazy sweep, inserting
 * the 3× warn / performing the 5× return) and, at the return stage, an
 * InProgressProvider refresh so the chip/mirror/rows drop the task instead of
 * ticking on a lie until the next navigation. A past-due boundary (task left
 * running overnight, app reopened) fires immediately. Renderless; mounted once
 * inside AppLayout's providers. The InProgress screen handles its own in-place
 * flip — this watcher covers every OTHER surface.
 */
export function OverrunWatcher() {
  const { activeTasks, refresh } = useInProgress()
  const { refresh: refreshNotifications } = useNotifications()
  const [ratios, setRatios] = useState<{ warnRatio: number; returnRatio: number } | null>(null)
  // One fire per (task, run, stage) — startedAt in the key re-arms a restart
  // (a status transition clears the server's overrun rows the same way).
  const firedRef = useRef(new Set<string>())

  // The ratios are config — fetch once, the first time something is running.
  useEffect(() => {
    if (activeTasks.length === 0 || ratios !== null) return
    let cancelled = false
    fetchPoints()
      .then((p) => !cancelled && setRatios(p.limits.overrun))
      .catch(() => undefined) // best-effort: without ratios we simply don't watch
    return () => {
      cancelled = true
    }
  }, [activeTasks.length, ratios])

  useEffect(() => {
    if (ratios === null || activeTasks.length === 0) return
    const timers: number[] = []
    const now = Date.now()
    for (const task of activeTasks) {
      if (!task.startedAt) continue
      const startMs = Date.parse(task.startedAt)
      const estimateMs = task.estimatedMinutes * 60_000
      const stages: ['warn' | 'return', number][] = [
        ['warn', ratios.warnRatio],
        ['return', ratios.returnRatio],
      ]
      for (const [stage, ratio] of stages) {
        const key = `${task.id}:${task.startedAt}:${stage}`
        if (firedRef.current.has(key)) continue
        const delay = Math.max(0, startMs + estimateMs * ratio + GRACE_MS - now)
        if (delay > MAX_DELAY_MS) continue
        timers.push(
          window.setTimeout(() => {
            firedRef.current.add(key)
            void (async () => {
              // The notifications fetch IS the trigger: the server's lazy
              // sweep inserts the warn row / performs the return on it.
              await refreshNotifications()
              if (stage === 'return') await refresh()
            })()
          }, delay),
        )
      }
    }
    return () => timers.forEach((t) => clearTimeout(t))
  }, [activeTasks, ratios, refresh, refreshNotifications])

  return null
}
