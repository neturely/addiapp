import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Flame, Zap } from 'lucide-react'
import { Mascot } from '@/components/Mascot'
import { PointsHelpLink } from '@/components/PointsHelpLink'
import { Loading } from '@/components/Loading'
import { fetchUserStats, type UserStats } from '@/lib/points'
import { friendlyMessage } from '@/lib/apiError'

/**
 * Color-identity stat card (#185, re-tinted #254). Each metric keeps its own
 * hue, but as a soft tint fill with ink-coloured label AND number (≥4.5:1) —
 * the old vivid-fill white numbers only cleared the 3:1 large-text tier and
 * read weak. The neutral "Tasks done" card overrides to a white surface + dark
 * number. The optional icon inherits the label colour via currentColor.
 */
function StatCard({
  label,
  value,
  icon,
  fill,
  ink,
  valueText,
}: {
  label: string
  value: string
  icon?: ReactNode
  fill: string
  ink: string
  valueText?: string
}) {
  return (
    <div className={`rounded-2xl p-5 text-center ${fill}`}>
      <div
        className={`flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wide ${ink}`}
      >
        {label}
        {icon}
      </div>
      <div className={`mt-1 text-3xl font-extrabold tabular-nums ${valueText ?? ink}`}>{value}</div>
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
      .catch((e) => !cancelled && setError(friendlyMessage(e, "your stats didn't load")))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <Loading page />
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
    // Solo surface (#256 review): centred like Play — the shell hides rail/column.
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center p-4 sm:p-8">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Mascot expression="neutral" />
        <h1 className="text-2xl font-bold text-gray-800">Your stats</h1>
      </div>

      {/* Tint + ink (#254): both label and number clear small-text AA
          (primary-ink on primary-tint = 4.76:1). The ? links the scoring
          guide (#385) — points are never unexplained. */}
      <section className="relative mb-4 rounded-2xl bg-primary-tint p-6 text-center">
        <PointsHelpLink className="absolute right-4 top-4" />
        <div className="text-xs font-medium uppercase tracking-wide text-primary-ink">Total points</div>
        <div className="text-5xl font-extrabold tabular-nums text-primary-ink">{total.toLocaleString()}</div>
      </section>

      {/* 2×2 colour-identity grid (#185) — also the mobile fix (was a cramped
          4-across row). The Daily-bonus card rides accent-tint/accent-ink: the
          ink is already violet, so the old one-off #a855f7 fill is gone. */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Day streak"
          value={`${streak.currentDays}`}
          icon={<Flame className="h-3.5 w-3.5" />}
          fill="bg-warning-tint"
          ink="text-warning-ink"
        />
        <StatCard
          label="Speed bonus"
          value={`+${lifetime.speedBonusTotal.toLocaleString()}`}
          icon={<Zap className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />}
          fill="bg-success-tint"
          ink="text-success-ink"
        />
        <StatCard
          label="Daily bonus"
          value={`×${+today.currentMultiplier.toFixed(2)}`}
          fill="bg-accent-tint"
          ink="text-accent-ink"
        />
        <StatCard
          label="Tasks done"
          value={lifetime.tasksCompleted.toLocaleString()}
          fill="bg-surface"
          ink="text-muted"
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
