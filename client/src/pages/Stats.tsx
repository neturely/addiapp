import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Zap } from 'lucide-react'
import { Mascot } from '@/components/Mascot'
import { fetchUserStats, type UserStats } from '@/lib/points'

/**
 * Color-identity stat card (#185). Each metric gets its own vivid fill with a
 * white number (large → clears the 3:1 rule) and a dark on-fill label; the
 * neutral "Tasks done" card overrides to a white surface + dark number. The
 * optional icon inherits the label colour via currentColor.
 */
function StatCard({
  label,
  value,
  icon,
  fill,
  labelText,
  valueText = 'text-white',
}: {
  label: string
  value: string
  icon?: ReactNode
  fill: string
  labelText: string
  valueText?: string
}) {
  return (
    <div className={`rounded-2xl p-5 text-center ${fill}`}>
      <div
        className={`flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wide ${labelText}`}
      >
        {label}
        {icon}
      </div>
      <div className={`mt-1 text-3xl font-extrabold tabular-nums ${valueText}`}>{value}</div>
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
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <span role="status">Loading…</span>
      </main>
    )
  }
  if (error || !stats) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-gray-700">{error ?? 'No stats yet'}</p>
        <Link to="/play" className="text-sm text-muted underline hover:text-gray-700">
          Back to Play
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

      {/* #143 rule: white only on the large stat number (≥24px) — WCAG 3:1 on
          the vivid fill; the small label stays dark (text-on-primary). */}
      <section className="mb-4 rounded-2xl bg-primary p-6 text-center text-on-primary">
        <div className="text-xs font-medium uppercase tracking-wide text-on-primary">Total points</div>
        <div className="text-5xl font-extrabold tabular-nums text-white">{total.toLocaleString()}</div>
      </section>

      {/* 2×2 colour-identity grid (#185) — also the mobile fix (was a cramped
          4-across row). Violet fill (#a855f7) is a one-off here: bg-accent is a
          light blue not tuned for white, so the Daily-bonus card uses a mid-tone
          violet where white (3.96) and the dark label #180938 (4.68) both pass. */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Day streak"
          value={`${streak.currentDays}`}
          icon={<Flame className="h-3.5 w-3.5" />}
          fill="bg-warning"
          labelText="text-on-warning"
        />
        <StatCard
          label="Speed bonus"
          value={`+${lifetime.speedBonusTotal.toLocaleString()}`}
          icon={<Zap className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />}
          fill="bg-success"
          labelText="text-on-success"
        />
        <StatCard
          label="Daily bonus"
          value={`×${+today.currentMultiplier.toFixed(2)}`}
          fill="bg-[#a855f7]"
          labelText="text-[#180938]"
        />
        <StatCard
          label="Tasks done"
          value={lifetime.tasksCompleted.toLocaleString()}
          fill="bg-surface"
          labelText="text-muted"
          valueText="text-gray-800"
        />
      </div>

      <p className="mt-4 text-center text-sm text-muted">
        Today: <span className="font-semibold text-gray-700">{today.pointsEarned}</span> pts from{' '}
        {today.tasksCompleted} {today.tasksCompleted === 1 ? 'task' : 'tasks'}
      </p>

    </main>
  )
}
