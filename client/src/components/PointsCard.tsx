import { useEffect, useState } from 'react'
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
    fetchPoints()
      .then((s) => !cancelled && setStats(s))
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
    <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#D85A30] to-[#e07a52] p-5 text-white">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-white/80">Total points</div>
        <div className="text-4xl font-extrabold tabular-nums">{total.toLocaleString()}</div>
      </div>
      <div className="flex gap-6 text-right">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-white/80">Daily bonus</div>
          <div className="text-2xl font-bold tabular-nums">×{+multiplier.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-white/80">Today</div>
          <div className="text-2xl font-bold tabular-nums">{pointsToday}</div>
          <div className="text-xs text-white/80">
            {tasksToday} {tasksToday === 1 ? 'task' : 'tasks'}
          </div>
        </div>
      </div>
    </section>
  )
}
