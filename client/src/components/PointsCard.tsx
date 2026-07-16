import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPoints, type PointsStats } from '@/lib/points'

/**
 * At-a-glance points summary for the dashboard (issue #37): lifetime total plus
 * the current live daily multiplier and today's tally. Re-fetches whenever
 * `refreshSignal` changes so it updates as tasks complete (PROJECT_SPEC §6/§7).
 */
export function PointsCard({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [stats, setStats] = useState<PointsStats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false) // a refetch can recover from a previous transient failure
    fetchPoints()
      .then((s) => {
        if (!cancelled) {
          setStats(s)
          setFailed(false)
        }
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [refreshSignal])

  if (failed) return null // a missing stats card shouldn't break the dashboard

  const total = stats?.total ?? 0
  const multiplier = stats?.today.currentMultiplier ?? 1
  const tasksToday = stats?.today.tasksCompleted ?? 0
  const pointsToday = stats?.today.pointsEarned ?? 0

  return (
    <Link
      to="/stats"
      className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-primary p-5 text-on-primary transition hover:opacity-90"
    >
      {/* #143 rule: white only on the large (≥24px) stat numbers — WCAG 3:1 on
          the vivid fill; the small labels stay dark (text-on-primary). */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-on-primary">Total points</div>
        <div className="text-4xl font-extrabold tabular-nums text-white">{total.toLocaleString()}</div>
      </div>
      <div className="flex gap-6 text-right">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-on-primary">Daily bonus</div>
          <div className="text-2xl font-bold tabular-nums text-white">×{+multiplier.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-on-primary">Today</div>
          <div className="text-2xl font-bold tabular-nums text-white">{pointsToday}</div>
          <div className="text-xs text-on-primary">
            {tasksToday} {tasksToday === 1 ? 'task' : 'tasks'}
          </div>
        </div>
      </div>
    </Link>
  )
}
