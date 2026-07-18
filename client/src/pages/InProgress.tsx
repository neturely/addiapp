import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { Mascot } from '@/components/Mascot'
import { Completion } from '@/components/Completion'
import { completeTask, getTask, parseMinutes, type AwardResult, type Task } from '@/lib/tasks'
import { fetchPoints, type PointsStats } from '@/lib/points'
import { formatClock } from '@/lib/time'
import { useInProgress } from '@/inprogress/useInProgress'

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
  const sizeParam = params.get('size')
  const size = sizeParam === 'small' || sizeParam === 'big' ? sizeParam : undefined
  const minutes = parseMinutes(params.get('minutes'))

  const [task, setTask] = useState<Task | null>(null)
  const [points, setPoints] = useState<PointsStats | null>(null)
  const [elapsed, setElapsed] = useState(0) // seconds
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [awarded, setAwarded] = useState<AwardResult | null>(null)
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the task')
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
      const { pointsAwarded } = await completeTask(task.id)
      setAwarded(pointsAwarded ?? null)
      setDone(true)
      // Completion renders in place (no route change), so refresh the header
      // chip imperatively — otherwise it would linger on the finished task (#135).
      void refreshActiveTask()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the task')
    } finally {
      setCompleting(false)
    }
  }, [task, refreshActiveTask])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <span role="status">Loading…</span>
      </main>
    )
  }

  if (error && !task) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot expression="idle" />
        <p className="text-gray-700">{error}</p>
        <Link to="/play" className="text-sm text-muted underline hover:text-gray-700">
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
        totalPoints={awarded?.totalPoints}
        multiplier={awarded?.multiplier}
        size={size}
        minutes={minutes}
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Mascot expression="idle" />
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">{workingLabel}</p>

      <div className="w-full max-w-md rounded-2xl bg-surface p-6">
        <h1 className="text-xl font-bold text-gray-800">{task.title}</h1>

        <div className="mt-4 font-mono text-5xl font-bold tabular-nums text-gray-900">
          {formatClock(elapsed)}
        </div>

        <div className="mt-4">
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
        </div>

        <p className="mt-4 text-sm font-medium text-gray-600">
          {inBonus ? (
            <>
              <Zap className="mb-0.5 inline h-4 w-4 text-warning-ink" fill="currentColor" strokeWidth={0} />{' '}
              Finish within{' '}
              <span className="font-bold text-success-ink">{formatClock(estimateSec - elapsed)}</span>{' '}
              for a speed bonus
            </>
          ) : (
            <>
              Past the estimate — no speed bonus now
              {basePoints != null ? `, but it's still worth ${basePoints} pts` : ''}. Finish strong.
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

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void onComplete()}
          disabled={completing}
          className="mt-5 w-full cursor-pointer rounded-lg bg-primary py-3 text-xl font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {completing ? 'Completing…' : 'Complete'}
        </button>
      </div>

      <p className="text-sm text-muted">
        You can leave any time — this task stays in progress until you complete it.
      </p>
    </main>
  )
}
