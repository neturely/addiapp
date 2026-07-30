import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CircleCheck, Play } from 'lucide-react'
import { buttonClasses } from './buttonClasses'
import { CONFETTI } from './confetti'
import { Mascot } from './Mascot'
import { useInProgress } from '@/inprogress/useInProgress'
import { fetchUserStats, type UserStats } from '@/lib/points'
import { PROJECTS_CHANGED_EVENT } from '@/lib/projects'
import { completeTask, type Task } from '@/lib/tasks'
import { elapsedSecondsSince, formatClock } from '@/lib/time'
import { useToast } from '@/toast/useToast'

/** Effort → tint pill classes (the #178 palette, AA dark-on-tint). */
const EFFORT_PILL = {
  low: 'bg-[#bfe9cd] text-on-success',
  medium: 'bg-[#ffe3a0] text-on-warning',
  high: 'bg-[#ffcdb8] text-on-primary',
} as const

/**
 * The shell's right column (#260; running mirror #264): the Play entry card —
 * mirroring the running task when one is in flight — plus Today / All-time stat
 * panels off GET /api/points/stats (the desktop home of the numbers the Stats
 * page shows on narrow viewports). Refetches on route change and after an
 * in-column completion — no polling. Tiles are tint + ink (#254).
 */
export function RightColumn() {
  const location = useLocation()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [statsRefresh, setStatsRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchUserStats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => undefined) // a missing column shouldn't break the shell
    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search, statsRefresh])

  const mult = stats?.today.currentMultiplier ?? 1
  const cap = stats?.multiplier.cap ?? 2
  const fillPct = Math.min(((mult - 1) / (cap - 1)) * 100, 100)

  return (
    // pl-0 + pr-6 (#256 review): the gap to the table is the content pane's own
    // pr-6, and the right page margin matches it — even 24px on both sides.
    <aside
      aria-label="Play and today"
      className="w-[19.5rem] flex-none overflow-y-auto pb-4 pl-0 pr-6 pt-14"
    >
      <PlayColumnCard onCompleted={() => setStatsRefresh((n) => n + 1)} />

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

/** The card's post-completion celebration (#256 review): title + points. */
type Celebration = { title: string; points: number | null }

/** Idle Play entry, or the running-task mirror(s) when tasks are in flight
 * (#264; parallel tasks each get their own timer, #256 review). Marking done
 * here flips the card into a brief confetti celebration — the same reward
 * moment the Play Completion screen gives — before settling back. */
function PlayColumnCard({ onCompleted }: { onCompleted: () => void }) {
  const { activeTasks, refresh } = useInProgress()
  const activeTask = activeTasks[0] ?? null
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const celebrationTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (celebrationTimer.current) window.clearTimeout(celebrationTimer.current)
    },
    [],
  )

  const completed = (title: string, points: number | null) => {
    setCelebration({ title, points })
    if (celebrationTimer.current) window.clearTimeout(celebrationTimer.current)
    celebrationTimer.current = window.setTimeout(() => setCelebration(null), 5000)
    void refresh()
    onCompleted()
  }

  return (
    <div className="relative mb-3 rounded-card bg-surface px-4 pb-5 pt-12 text-center">
      {celebration &&
        CONFETTI.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className={`animate-confetti absolute h-2.5 w-2.5 rounded-full ${c.pos}`}
            style={{ backgroundColor: c.color, animationDelay: c.delay }}
          />
        ))}
      <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2">
        <Mascot
          expression={celebration ? 'celebrating' : activeTask ? 'neutral' : 'idle'}
          halo
          className="h-[4.5rem] w-[4.5rem]"
        />
      </div>
      {celebration ? (
        <CelebrationPanel celebration={celebration} />
      ) : activeTask ? (
        <>
          <RunningMirror task={activeTask} onCompleted={completed} />
          {/* Other running tasks stack as compact mirrors — most recent is the
              hero above; each keeps its own live clock and Mark done. */}
          {activeTasks.slice(1).map((t) => (
            <CompactMirror key={t.id} task={t} onCompleted={completed} />
          ))}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}

/**
 * The card's reward moment (#256 review) — shown for a few seconds after an
 * in-column Mark done, with the confetti + celebrating mascot around it. A
 * `role="status"` live region so the outcome (incl. points) is announced; the
 * points panel mirrors the Completion screen's tinted treatment.
 */
function CelebrationPanel({ celebration }: { celebration: Celebration }) {
  return (
    <div role="status">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-success-ink">
        Nice work!
      </div>
      <h2 className="mb-3 mt-1.5 line-clamp-2 font-semibold leading-snug text-gray-800">
        {celebration.title}
      </h2>
      {celebration.points != null ? (
        <div className="mx-auto max-w-[10rem] rounded-xl bg-success-tint px-4 py-3">
          <div className="text-3xl font-bold tabular-nums tracking-tight text-success-ink">
            +{celebration.points}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-success-ink">
            points
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">Task complete.</p>
      )}
    </div>
  )
}

/**
 * The running-task mirror (#264): live clock off `startedAt` (client-side tick,
 * same anchor as the InProgress screen + timer chip — always in sync), the
 * speed-bonus deadline, and Mark done right from the column. Completing here
 * doesn't navigate, so it refreshes the InProgressProvider imperatively (the
 * #135 chip pattern) and signals the rail/stats to refetch.
 */
function RunningMirror({
  task,
  onCompleted,
}: {
  task: Task
  onCompleted: (title: string, points: number | null) => void
}) {
  const { showToast } = useToast()
  const [now, setNow] = useState(() => Date.now())
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  const elapsed = elapsedSecondsSince(task.startedAt, now)
  const estimateSec = task.estimatedMinutes * 60
  const remaining = estimateSec - elapsed

  async function markDone() {
    setCompleting(true)
    try {
      const { pointsAwarded } = await completeTask(task.id)
      // Remaining-count listeners (the rail) refetch on this signal. The
      // reward itself shows as the card's confetti celebration, not a toast.
      window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
      onCompleted(task.title, pointsAwarded?.totalPoints ?? null)
    } catch {
      showToast({ message: 'Could not complete the task.', icon: CircleCheck, tone: 'neutral' })
    } finally {
      setCompleting(false)
    }
  }

  return (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-ink">
        Working on
      </div>
      <h2 className="mb-2 mt-1.5 line-clamp-2 font-semibold leading-snug text-gray-800">
        {task.title}
      </h2>
      <div className="mb-3 flex flex-wrap justify-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${EFFORT_PILL[task.complexity]}`}
        >
          {task.complexity[0].toUpperCase() + task.complexity.slice(1)}
        </span>
        <span className="rounded-full bg-field px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">
          {task.estimatedMinutes} min
        </span>
      </div>
      <div className="text-4xl font-bold tabular-nums tracking-tight text-gray-900">
        {formatClock(elapsed)}
      </div>
      <p className="mt-2 text-xs text-muted">
        {remaining > 0
          ? `Full speed bonus if done within ${formatClock(remaining)}`
          : 'Past the estimate — finish strong'}
      </p>
      <div className="mt-4 flex gap-2">
        <Link
          to={`/play/progress/${task.id}`}
          className={buttonClasses('secondary', 'md', 'flex-1')}
        >
          Open
        </Link>
        <button
          type="button"
          disabled={completing}
          onClick={() => void markDone()}
          className={buttonClasses('success', 'md', 'flex-1')}
        >
          {completing ? 'Saving…' : 'Mark done'}
        </button>
      </div>
    </>
  )
}

/**
 * Compact mirror for a second/third parallel running task (#256 review): a
 * hairline-divided row under the hero mirror — title (→ its InProgress screen),
 * its own live clock, and a one-tap Mark done.
 */
function CompactMirror({
  task,
  onCompleted,
}: {
  task: Task
  onCompleted: (title: string, points: number | null) => void
}) {
  const { showToast } = useToast()
  const [now, setNow] = useState(() => Date.now())
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  async function markDone() {
    setCompleting(true)
    try {
      const { pointsAwarded } = await completeTask(task.id)
      window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
      onCompleted(task.title, pointsAwarded?.totalPoints ?? null)
    } catch {
      showToast({ message: 'Could not complete the task.', icon: CircleCheck, tone: 'neutral' })
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="mt-4 flex items-center gap-2 border-t border-field pt-3 text-left">
      <div className="min-w-0 flex-1">
        <Link
          to={`/play/progress/${task.id}`}
          className="block truncate text-xs font-semibold text-gray-800 transition hover:text-primary-ink"
        >
          {task.title}
        </Link>
        <span className="font-mono text-xs tabular-nums text-muted">
          {formatClock(elapsedSecondsSince(task.startedAt, now))}
        </span>
      </div>
      <button
        type="button"
        disabled={completing}
        onClick={() => void markDone()}
        aria-label={`Mark ${task.title} done`}
        className="inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-lg text-success-ink transition hover:bg-success-tint disabled:opacity-50"
      >
        <CircleCheck className="h-5 w-5" aria-hidden />
      </button>
    </div>
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
