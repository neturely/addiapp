import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Zap } from 'lucide-react'
import { Mascot } from '@/components/Mascot'
import { fetchUserStats, type UserStats } from '@/lib/points'

function Tile({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-5 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums text-gray-800">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

/**
 * User points/stats page (issue #38, PROJECT_SPEC §7). A dedicated at-a-glance
 * view of lifetime totals, tasks completed, day streak, speed bonuses earned, and
 * the current live daily multiplier — reading GET /api/points/stats.
 */
export function Stats() {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchUserStats()
      .then((s) => !cancelled && setStats(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load stats'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-muted">Loading…</main>
  }
  if (error || !stats) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-gray-700">{error ?? 'No stats yet'}</p>
        <Link to="/" className="text-sm text-muted underline hover:text-gray-700">
          Back home
        </Link>
      </main>
    )
  }

  const { total, lifetime, today, streak } = stats

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-4 sm:p-8">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Mascot expression="neutral" />
        <h1 className="text-2xl font-bold text-gray-800">Your stats</h1>
      </div>

      <section className="mb-4 rounded-2xl bg-primary p-6 text-center text-white">
        <div className="text-xs font-medium uppercase tracking-wide text-white">Total points</div>
        <div className="text-5xl font-extrabold tabular-nums">{total.toLocaleString()}</div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Tasks done" value={lifetime.tasksCompleted.toLocaleString()} />
        <Tile
          label="Day streak"
          value={`${streak.currentDays}`}
          hint={
            <span className="inline-flex items-center gap-1">
              {streak.currentDays === 1 ? 'day' : 'days'}
              <Flame className="h-3.5 w-3.5 text-warning" />
            </span>
          }
        />
        <Tile
          label="Speed bonus"
          value={`+${lifetime.speedBonusTotal.toLocaleString()}`}
          hint={
            <span className="inline-flex items-center gap-1">
              earned
              <Zap className="h-3.5 w-3.5 text-warning" fill="currentColor" strokeWidth={0} />
            </span>
          }
        />
        <Tile label="Daily bonus" value={`×${+today.currentMultiplier.toFixed(2)}`} hint="next task" />
      </div>

      <p className="mt-4 text-center text-sm text-muted">
        Today: <span className="font-semibold text-gray-700">{today.pointsEarned}</span> pts from{' '}
        {today.tasksCompleted} {today.tasksCompleted === 1 ? 'task' : 'tasks'}
      </p>

    </main>
  )
}
