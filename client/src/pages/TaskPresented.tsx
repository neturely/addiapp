import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Shuffle, SlidersHorizontal } from 'lucide-react'
import { Mascot } from '@/components/Mascot'
import { EmptyState } from '@/components/EmptyState'
import {
  fetchNextTask,
  parseMinutes,
  startTask,
  type Task,
  type TaskComplexity,
  type WinSize,
} from '@/lib/tasks'
import { fetchPoints, type PointsStats } from '@/lib/points'

const COMPLEXITY_TAG: Record<TaskComplexity, { label: string; className: string }> = {
  low: { label: 'Low effort', className: 'bg-success-tint text-success-ink' },
  medium: { label: 'Medium', className: 'bg-warning-tint text-warning-ink' },
  high: { label: 'Big effort', className: 'bg-primary-tint text-primary-ink' },
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

function parseSize(raw: string | null): WinSize | undefined {
  return raw === 'small' || raw === 'big' ? raw : undefined
}

/**
 * Play-mode task-presented screen (issue #31). Reads the choice-screen filters
 * from the URL, asks the server for one matching task, and shows it with an
 * up-front points estimate. Start → in_progress; "give me something else"
 * re-rolls, excluding the current task so it isn't re-offered immediately.
 */
export function TaskPresented() {
  const [params] = useSearchParams()
  const size = parseSize(params.get('size'))
  const minutes = parseMinutes(params.get('minutes'))

  const [task, setTask] = useState<Task | null>()
  const [points, setPoints] = useState<PointsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const navigate = useNavigate()

  const roll = useCallback(
    async (exclude?: number) => {
      setLoading(true)
      setError(null)
      try {
        const next = await fetchNextTask({ size, minutes, exclude })
        setTask(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load a task')
      } finally {
        setLoading(false)
      }
    },
    [size, minutes],
  )

  // Initial load: the task and the points context (base points + live multiplier).
  useEffect(() => {
    void roll()
    fetchPoints()
      .then(setPoints)
      .catch(() => setPoints(null)) // points are a nice-to-have here, not blocking
  }, [roll])

  async function onStart() {
    if (!task) return
    setStarting(true)
    setError(null)
    try {
      const updated = await startTask(task.id)
      // Straight into the in-progress screen (#33) — the timer starts from the
      // server's startedAt that this PATCH just set. Carry the win/time filters so
      // the #34 "Keep going" action can reuse them for the next task.
      const progressParams = new URLSearchParams()
      if (size) progressParams.set('size', size)
      if (minutes != null) progressParams.set('minutes', String(minutes))
      const qs = progressParams.toString()
      navigate(`/play/progress/${updated.id}${qs ? `?${qs}` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the task')
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <span role="status">Finding you a task…</span>
      </main>
    )
  }

  if (!task) {
    return <EmptyState filtered={Boolean(size || minutes)} />
  }

  const tag = COMPLEXITY_TAG[task.complexity]
  const basePoints = points?.basePoints[task.complexity]
  const multiplier = points?.today.currentMultiplier

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Mascot expression="neutral" />

      <div className="w-full max-w-md rounded-2xl bg-surface p-6">
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${tag.className}`}
        >
          {tag.label}
        </span>
        <h1 className="mt-3 text-2xl font-bold text-gray-800">{task.title}</h1>
        <p className="mt-1 text-muted">~{formatMinutes(task.estimatedMinutes)}</p>

        {task.description && (
          <p className="mt-3 text-left text-sm whitespace-pre-wrap text-gray-600">
            {task.description}
          </p>
        )}

        {basePoints != null && (
          <div className="mt-4 rounded-xl bg-primary-tint p-3">
            <div className="text-lg font-bold text-primary-ink">≈ {basePoints} pts</div>
            <div className="text-xs text-muted">
              + speed bonus if you beat the estimate
              {multiplier && multiplier > 1 ? ` · ×${multiplier.toFixed(2)} today` : ''}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="mt-5 w-full rounded-lg bg-primary py-3 text-xl font-bold text-white transition hover:opacity-90 disabled:bg-gray-400"
        >
          {starting ? 'Starting…' : 'Start'}
        </button>

        <div className="mt-3 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => void roll(task.id)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-muted transition hover:bg-primary-tint hover:text-primary-ink"
          >
            <Shuffle className="h-4 w-4" />
            Give me something else
          </button>
          <Link
            to="/play"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-muted transition hover:bg-primary-tint hover:text-primary-ink"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Change my pick
          </Link>
        </div>
      </div>
    </main>
  )
}
