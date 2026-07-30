import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Play } from 'lucide-react'
import { buttonClasses } from './buttonClasses'
import { Mascot } from './Mascot'
import { fetchUserStats, type UserStats } from '@/lib/points'

/**
 * The shell's right column (#260): the Play entry card plus Today / All-time
 * stat panels off GET /api/points/stats — the desktop home of the numbers the
 * Stats page shows on narrow viewports. Refetches on route change (a completion
 * happens on the Play routes where the column is hidden, so returning to a
 * shell view is the natural refresh point — no polling). The running-task
 * mirror lands in D (#264).
 *
 * Tiles are tint + ink (#254 — small-text AA at any size, ratios in index.css).
 */
export function RightColumn() {
  const location = useLocation()
  const [stats, setStats] = useState<UserStats | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchUserStats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => undefined) // a missing column shouldn't break the shell
    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search])

  const mult = stats?.today.currentMultiplier ?? 1
  const cap = stats?.multiplier.cap ?? 2
  const fillPct = Math.min(((mult - 1) / (cap - 1)) * 100, 100)

  return (
    <aside
      aria-label="Play and today"
      className="w-72 flex-none overflow-y-auto px-3 pb-4 pt-14"
    >
      <div className="relative mb-3 rounded-card bg-surface px-4 pb-5 pt-12 text-center">
        <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2">
          <Mascot expression="idle" halo className="h-[4.5rem] w-[4.5rem]" />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-ink">
          Ready when you are
        </div>
        <h2 className="mb-1 mt-1.5 font-semibold text-gray-800">Nothing running</h2>
        <p className="mb-4 text-xs leading-relaxed text-muted">
          Pick one for me and start the clock.
        </p>
        <Link to="/play" className={buttonClasses('primary', 'lg', 'w-full')}>
          <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden />
          Play
        </Link>
      </div>

      <section className="mb-3 rounded-xl bg-surface p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Today</h2>
        <div className="text-4xl font-bold tabular-nums tracking-tight text-success-ink">
          {stats?.today.pointsEarned ?? 0}
        </div>
        <div className="mt-1 text-xs text-muted">
          points earned · {stats?.today.tasksCompleted ?? 0}{' '}
          {stats?.today.tasksCompleted === 1 ? 'task' : 'tasks'} done
        </div>
        <div className="mb-2 mt-4 h-1.5 overflow-hidden rounded-full bg-field">
          <div className="h-full rounded-full bg-success" style={{ width: `${fillPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-700">
          <span>Multiplier ×{+mult.toFixed(2)}</span>
          {stats && (
            <span>
              ×{stats.multiplier.cap} at {stats.multiplier.capTaskNumber}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
          All time
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            className="col-span-2 bg-primary-tint text-primary-ink"
            label="Total points"
            value={(stats?.total ?? 0).toLocaleString()}
            big
          />
          <Tile
            className="bg-warning-tint text-warning-ink"
            label="Day streak"
            value={`${stats?.streak.currentDays ?? 0}`}
          />
          <Tile
            className="bg-success-tint text-success-ink"
            label="Speed bonus"
            value={`+${(stats?.lifetime.speedBonusTotal ?? 0).toLocaleString()}`}
          />
          <Tile
            className="col-span-2 bg-field text-gray-700"
            label="Tasks done"
            value={(stats?.lifetime.tasksCompleted ?? 0).toLocaleString()}
          />
        </div>
      </section>
    </aside>
  )
}

function Tile({
  label,
  value,
  className,
  big = false,
}: {
  label: string
  value: string
  className: string
  big?: boolean
}) {
  return (
    <div className={`flex min-h-[4.5rem] flex-col rounded-[10px] p-3 ${className}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider">{label}</div>
      <div
        className={`mt-auto pt-2 font-bold tabular-nums leading-none tracking-tight ${big ? 'text-[1.75rem]' : 'text-[1.4rem]'}`}
      >
        {value}
      </div>
    </div>
  )
}
