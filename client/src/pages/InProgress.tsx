import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Mascot } from '@/components/Mascot'
import { completeTask, getTask, type AwardResult, type Task } from '@/lib/tasks'
import { fetchPoints, type PointsStats } from '@/lib/points'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Elapsed seconds → M:SS, or H:MM:SS past an hour. */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * Play-mode task-in-progress screen (issue #33). A live count-up timer derived
 * from the server's startedAt (so it survives a refresh) plus a speed-bonus meter
 * against the estimate — making the §7 speed bonus tangible while you work.
 * Complete → done, which awards points (#28). The real celebration screen is #34;
 * until then Complete lands on a lightweight acknowledgement here.
 */
export function InProgress() {
  const { id } = useParams()
  const taskId = Number(id)
  const navigate = useNavigate()

  const [task, setTask] = useState<Task | null>(null)
  const [points, setPoints] = useState<PointsStats | null>(null)
  const [elapsed, setElapsed] = useState(0) // seconds
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [awarded, setAwarded] = useState<AwardResult | null>(null)
  const [done, setDone] = useState(false)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the task')
    } finally {
      setCompleting(false)
    }
  }, [task])

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-gray-500">Loading…</main>
  }

  if (error && !task) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Mascot mood="sleepy" />
        <p className="text-gray-600">{error}</p>
        <Link to="/play" className="text-sm text-gray-500 underline hover:text-gray-700">
          Back to Play
        </Link>
      </main>
    )
  }

  // Completion acknowledgement — stopgap until the #34 celebration screen exists.
  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
        <Mascot mood="happy" />
        <h1 className="text-3xl font-bold text-gray-800">Done! 🎉</h1>
        {awarded ? (
          <div className="space-y-1">
            <div className="text-2xl font-bold text-[#a8431f]">+{awarded.totalPoints} pts</div>
            <div className="text-sm text-gray-500">
              {awarded.basePoints} base
              {awarded.speedBonus > 0 ? ` + ${awarded.speedBonus} speed bonus ⚡` : ''}
              {awarded.multiplier > 1 ? ` · ×${awarded.multiplier.toFixed(2)} today` : ''}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Nice work.</p>
        )}
        <div className="flex flex-col gap-3">
          <Link
            to="/play"
            className="rounded-lg bg-[#D85A30] px-6 py-3 font-semibold text-white transition hover:bg-[#c24d27]"
          >
            Another task
          </Link>
          <Link to="/" className="text-sm text-gray-500 underline hover:text-gray-700">
            Back home
          </Link>
        </div>
      </main>
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
      <Mascot mood="happy" />
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Working on it</p>

      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">{task.title}</h1>

        <div className="mt-4 font-mono text-5xl font-bold tabular-nums text-gray-900">
          {formatClock(elapsed)}
        </div>

        <div className="mt-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                inBonus ? 'bg-[#2FA39B]' : 'bg-[#D85A30]'
              }`}
              style={{ width: `${meterFrac * 100}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {elapsedMin} / {task.estimatedMinutes} min
          </div>
        </div>

        <p className="mt-4 text-sm font-medium text-gray-600">
          {inBonus ? (
            <>
              ⚡ Finish within{' '}
              <span className="font-bold text-[#1f746e]">{formatClock(estimateSec - elapsed)}</span>{' '}
              for a speed bonus
            </>
          ) : (
            <>
              Past the estimate — no speed bonus now
              {basePoints != null ? `, but it's still worth ${basePoints} pts` : ''}. Finish strong 💪
            </>
          )}
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void onComplete()}
          disabled={completing}
          className="mt-5 w-full rounded-lg bg-[#D85A30] py-3 font-semibold text-white transition hover:bg-[#c24d27] disabled:bg-gray-400"
        >
          {completing ? 'Completing…' : 'Complete'}
        </button>
      </div>

      <Link to="/" className="text-sm text-gray-400 underline hover:text-gray-600">
        Leave it running, go home
      </Link>
    </main>
  )
}
