import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Zap } from 'lucide-react'
import { Mascot } from '@/components/Mascot'
import { PlayCard } from '@/components/PlayCard'
import { Completion } from '@/components/Completion'
import {
  completeTask,
  getTask,
  parseMinutes,
  type AwardResult,
  type ProjectCompletion,
  type Task,
} from '@/lib/tasks'
import { fetchPoints, type PointsStats } from '@/lib/points'
import { Loading } from '@/components/Loading'
import { elapsedSecondsSince, formatClock, isOverdue } from '@/lib/time'
import { useInProgress } from '@/inprogress/useInProgress'
import { friendlyMessage } from '@/lib/apiError'
import { useErrorReporter } from '@/toast/useErrorReporter'

/** Effort → tint pill classes (#264; the #178 palette, AA dark-on-tint). */
const EFFORT_PILL = {
  low: 'bg-[#bfe9cd] text-on-success',
  medium: 'bg-[#ffe3a0] text-on-warning',
  high: 'bg-[#ffcdb8] text-on-primary',
} as const

/** Rotating "in progress" labels (#181) — a random one is picked per mount. */
const WORKING_LABELS = [
  'Working on it',
  'Making progress',
  'In the zone',
  'Getting it done',
  'Chipping away',
  'On a roll',
  'Almost there',
  'Locked in',
  'Doing the thing',
  'Full steam ahead',
]

/**
 * Play-mode task-in-progress screen (issue #33). A live count-up timer derived
 * from the server's startedAt (so it survives a refresh) plus a speed-bonus meter
 * against the estimate — making the §7 speed bonus tangible while you work.
 * Complete → done, which awards points (#28) and hands off to the celebration
 * screen (#34), reusing pointsAwarded and the win/time filters from the URL.
 */
export function InProgress() {
  const { id } = useParams()
  const taskId = Number(id)
  const navigate = useNavigate()
  const { refresh: refreshActiveTask } = useInProgress()

  // Win/time filters carried from the task-presented screen (#31), so the #34
  // "Keep going" action can offer another task without re-asking.
  const [params] = useSearchParams()
  const mode = params.get('mode') === 'projects' ? 'projects' : undefined // #238
  const sizeParam = params.get('size')
  const size = mode
    ? undefined
    : sizeParam === 'small' || sizeParam === 'big'
      ? sizeParam
      : undefined
  const minutes = parseMinutes(params.get('minutes'))
  const category = parseMinutes(params.get('category')) // same positive-int guard (#276)

  const [task, setTask] = useState<Task | null>(null)
  const [points, setPoints] = useState<PointsStats | null>(null)
  const [elapsed, setElapsed] = useState(0) // seconds
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reportError = useErrorReporter()
  const [completing, setCompleting] = useState(false)
  const [awarded, setAwarded] = useState<AwardResult | null>(null)
  const [projectDone, setProjectDone] = useState<ProjectCompletion | null>(null) // #240
  const [recursAt, setRecursAt] = useState<string | null>(null) // #250 comes-back date
  const [done, setDone] = useState(false)
  const [workingLabel] = useState(
    () => WORKING_LABELS[Math.floor(Math.random() * WORKING_LABELS.length)],
  )
  const startedAtRef = useRef<number | null>(null)

  // Load the task + points context, and anchor the timer to the server start time.
  useEffect(() => {
    if (!Number.isInteger(taskId) || taskId <= 0) {
      setError('Invalid task')
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const t = await getTask(taskId)
        if (cancelled) return
        if (t.status !== 'in_progress') {
          // Already done, or never started — the in-progress screen doesn't apply.
          navigate(t.status === 'done' ? '/' : '/play', { replace: true })
          return
        }
        startedAtRef.current = t.startedAt ? Date.parse(t.startedAt) : Date.now()
        setTask(t)
        setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)))
      } catch (err) {
        if (!cancelled) setError(friendlyMessage(err, "the task didn't load"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    fetchPoints()
      .then((p) => !cancelled && setPoints(p))
      .catch(() => undefined) // points are used only for messaging, non-blocking
    return () => {
      cancelled = true
    }
  }, [taskId, navigate])

  // Tick the timer once per second while working (stops on completion).
  useEffect(() => {
    if (!task || done) return
    const iv = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)))
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [task, done])

  const onComplete = useCallback(async () => {
    if (!task) return
    setCompleting(true)
    setError(null)
    try {
      const { pointsAwarded, projectCompleted, recursAt: nextAt } = await completeTask(task.id)
      setAwarded(pointsAwarded ?? null)
      setProjectDone(projectCompleted ?? null)
      setRecursAt(nextAt ?? null)
      setDone(true)
      // Completion renders in place (no route change), so refresh the header
      // chip imperatively — otherwise it would linger on the finished task (#135).
      void refreshActiveTask()
    } catch (err) {
      reportError(err, "the task wasn't marked done", setError)
    } finally {
      setCompleting(false)
    }
  }, [task, refreshActiveTask, reportError])

  if (loading) {
    return <Loading page />
  }

  if (error && !task) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot expression="idle" />
        <p className="text-gray-700">{error}</p>
        <Link to="/play" className="tap-44 text-sm text-muted underline hover:text-gray-700">
          Back to Play
        </Link>
      </main>
    )
  }

  // Celebration screen (#34), fed by the pointsAwarded from the Complete PATCH.
  if (done) {
    return (
      <Completion
        title={task?.title ?? 'Task complete'}
        taskId={task?.id}
        totalPoints={awarded?.totalPoints}
        reason={awarded?.reason}
        multiplier={awarded?.multiplier}
        size={size}
        minutes={minutes}
        mode={mode}
        category={category}
        projectBonus={projectDone}
        recursAt={recursAt}
      />
    )
  }

  if (!task) return null

  const estimateSec = task.estimatedMinutes * 60
  const meterFrac = estimateSec > 0 ? Math.min(elapsed / estimateSec, 1) : 1
  const inBonus = elapsed < estimateSec
  const elapsedMin = Math.floor(elapsed / 60)
  const basePoints = points?.basePoints[task.complexity]

  return (
    <PlayCard
      mascot={<Mascot expression="idle" halo className="h-24 w-24" />}
      eyebrow={workingLabel}
      title={<h1 className="text-xl font-bold text-gray-800">{task.title}</h1>}
      body={
        <>
          {/* Effort + estimate pills (#264, prototype play-meta). */}
          <div className="mt-2 flex justify-center gap-1.5">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${EFFORT_PILL[task.complexity]}`}
            >
              {task.complexity[0].toUpperCase() + task.complexity.slice(1)}
            </span>
            <span className="rounded-full bg-field px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">
              {task.estimatedMinutes} min estimate
            </span>
          </div>
          {task.description && (
            <p className="mt-2 text-left text-sm whitespace-pre-wrap text-gray-600">
              {task.description}
            </p>
          )}
        </>
      }
      hero={
        // Overdue (#402): the hero clock goes danger past the estimate — the
        // "Past the estimate" copy below already carries it for SRs.
        <div
          className={`font-mono text-5xl font-bold tabular-nums ${
            inBonus ? 'text-gray-900' : 'text-danger-ink'
          }`}
        >
          {formatClock(elapsed)}
        </div>
      }
      context={
        <>
          {/* #143: vivid meter fills are a DELIBERATE choice — their contrast vs
              the track is below 1.4.11's 3:1 (green 1.86, gold 1.41), accepted
              because this is a decorative indicator and the exact elapsed/estimate
              time is always shown as text below. Do not "fix" to darker shades. */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                inBonus ? 'bg-success' : 'bg-warning'
              }`}
              style={{ width: `${meterFrac * 100}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-muted">
            {elapsedMin} / {task.estimatedMinutes} min
          </div>

          <p className="mt-4 text-sm font-medium text-gray-600">
            {inBonus ? (
              <>
                <Zap
                  className="mb-0.5 inline h-4 w-4 text-warning-ink"
                  fill="currentColor"
                  strokeWidth={0}
                />{' '}
                Finish within{' '}
                <span className="font-bold text-success-ink">
                  {formatClock(estimateSec - elapsed)}
                </span>{' '}
                for a speed bonus
              </>
            ) : (
              <>
                Past the estimate — no speed bonus now
                {basePoints != null ? `, but it's still worth ${basePoints} pts` : ''}. Finish
                strong.
              </>
            )}
          </p>

          {/* SR-only milestone: announces ONCE when the bonus window closes. The
              text only changes at the crossing (empty → message), so a screen
              reader announces it a single time and the per-second clock is never
              in a live region (would spam). A task resumed already-past-estimate
              renders the text on first mount → not announced, which is correct. */}
          <p role="status" className="sr-only">
            {inBonus ? '' : 'Past the estimate — no speed bonus now.'}
          </p>
        </>
      }
      primary={
        <>
          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void onComplete()}
            disabled={completing}
            className="w-full rounded-control bg-success-deep py-3 text-lg font-semibold text-white transition hover:bg-success-deep-hover disabled:cursor-not-allowed disabled:bg-field disabled:text-gray-400"
          >
            {completing ? 'Completing…' : 'Mark done'}
          </button>
        </>
      }
      secondary={<AlsoRunning currentId={task.id} />}
      footer="You can leave any time — this task stays in progress until you complete it."
    />
  )
}

/**
 * Other parallel running tasks (#256 review), listed under the card's CTA —
 * clicking one swaps it into this screen (a plain navigate: the route decides
 * which task is the main card, so back/refresh keep working). Each row ticks
 * its own clock off `startedAt`, same anchor as the main timer.
 */
function AlsoRunning({ currentId }: { currentId: number }) {
  const { activeTasks } = useInProgress()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const others = activeTasks.filter((t) => t.id !== currentId)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (others.length === 0) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [others.length])
  if (others.length === 0) return null
  const qs = params.toString()
  return (
    <div className="border-t border-field pt-3 text-left">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Also running
      </div>
      {others.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => navigate(`/play/progress/${t.id}${qs ? `?${qs}` : ''}`)}
          aria-label={`Switch to ${t.title}${isOverdue(t, now) ? ' (over estimate)' : ''}`}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-page sm:min-h-0"
        >
          <span className="min-w-0 truncate font-medium text-gray-800">{t.title}</span>
          <span
            className={`flex-none font-mono text-xs tabular-nums ${
              isOverdue(t, now) ? 'text-danger-ink' : 'text-muted'
            }`}
          >
            {formatClock(elapsedSecondsSince(t.startedAt, now))}
          </span>
        </button>
      ))}
    </div>
  )
}
