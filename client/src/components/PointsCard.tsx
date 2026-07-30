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

  // Three uniform columns (#174): Tasks Today · Daily Bonus · Total Points.
  // Tint + ink (#254): success-ink on success-tint is 4.57:1, so labels and
  // numbers pass small-text AA — no size-tier dependence like the old
  // white-on-vivid banner.
  const columns: { label: string; value: string }[] = [
    { label: 'Tasks today', value: tasksToday.toLocaleString() },
    { label: 'Daily bonus', value: `×${+multiplier.toFixed(2)}` },
    { label: 'Total points', value: total.toLocaleString() },
  ]

  return (
    <Link
      to="/stats"
      className="mb-6 flex items-center justify-between gap-4 rounded-2xl bg-success-tint px-8 py-5 text-success-ink transition hover:opacity-80"
    >
      {columns.map((c) => (
        <div key={c.label}>
          <div className="text-xs font-medium uppercase tracking-wide">{c.label}</div>
          <div className="text-4xl font-extrabold tabular-nums">{c.value}</div>
        </div>
      ))}
    </Link>
  )
}
