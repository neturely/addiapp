import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mascot } from '@/components/Mascot'
import { EmptyState } from '@/components/EmptyState'
import { fetchNextTask, startTask, type Task, type TaskComplexity, type WinSize } from '@/lib/tasks'
import { fetchPoints, type PointsStats } from '@/lib/points'

const COMPLEXITY_TAG: Record<TaskComplexity, { label: string; className: string }> = {
  low: { label: 'Low effort', className: 'bg-[#2FA39B]/15 text-[#1f746e]' },
  medium: { label: 'Medium', className: 'bg-[#F5A623]/15 text-[#a06d00]' },
  high: { label: 'Big effort', className: 'bg-[#D85A30]/15 text-[#a8431f]' },
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
  const minutesParam = params.get('minutes')
  const minutes = minutesParam ? Number(minutesParam) : undefined

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
    return <main className="flex min-h-screen items-center justify-center text-gray-500">Finding you a task…</main>
  }

  if (!task) {
    return <EmptyState filtered={Boolean(size || minutes)} />
  }

  const tag = COMPLEXITY_TAG[task.complexity]
  const basePoints = points?.basePoints[task.complexity]
  const multiplier = points?.today.currentMultiplier

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Mascot mood="happy" />

      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${tag.className}`}>
          {tag.label}
        </span>
        <h1 className="mt-3 text-2xl font-bold text-gray-800">{task.title}</h1>
        <p className="mt-1 text-gray-500">~{formatMinutes(task.estimatedMinutes)}</p>

        {basePoints != null && (
          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <div className="text-lg font-bold text-[#a8431f]">≈ {basePoints} pts</div>
            <div className="text-xs text-gray-500">
              + speed bonus if you beat the estimate
              {multiplier && multiplier > 1 ? ` · ×${multiplier.toFixed(2)} today` : ''}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="mt-5 w-full rounded-lg bg-[#D85A30] py-3 font-semibold text-white transition hover:bg-[#c24d27] disabled:bg-gray-400"
        >
          {starting ? 'Starting…' : 'Start'}
        </button>
        <button
          type="button"
          onClick={() => void roll(task.id)}
          className="mt-2 w-full rounded-lg py-2 text-sm text-gray-500 underline hover:text-gray-700"
        >
          Give me something else
        </button>
      </div>

      <Link to="/play" className="text-sm text-gray-500 underline hover:text-gray-700">
        Change my pick
      </Link>
    </main>
  )
}
