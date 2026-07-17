import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Timer } from 'lucide-react'
import type { Task } from '@/lib/tasks'
import { formatClock, elapsedSecondsSince } from '@/lib/time'

/**
 * Header chip for the currently in-progress task (#135). Ticks client-side off
 * the server `startedAt` (so it matches the InProgress screen and survives a
 * refresh — no server poll for the seconds); links to that task's InProgress
 * screen. Only rendered when there's an active task. The ticking time is NOT a
 * live region — the aria-label stays stable so a screen reader isn't spammed
 * every second (the InProgress screen carries the real timer).
 */
export function TimerChip({ task }: { task: Task }) {
  const [elapsed, setElapsed] = useState(() => elapsedSecondsSince(task.startedAt))
  useEffect(() => {
    setElapsed(elapsedSecondsSince(task.startedAt))
    const iv = setInterval(() => setElapsed(elapsedSecondsSince(task.startedAt)), 1000)
    return () => clearInterval(iv)
  }, [task.startedAt])

  return (
    <Link
      to={`/play/progress/${task.id}`}
      aria-label={`Resume “${task.title}”`}
      title={task.title}
      className="inline-flex items-center gap-1.5 rounded-full bg-warning-tint px-3 py-1 text-sm font-semibold tabular-nums text-warning-ink transition hover:opacity-90"
    >
      <Timer className="h-4 w-4" strokeWidth={2} aria-hidden />
      {formatClock(elapsed)}
    </Link>
  )
}
