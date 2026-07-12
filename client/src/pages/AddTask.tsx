import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createTask, type TaskComplexity } from '@/lib/tasks'
import { fetchPoints } from '@/lib/points'

/** Fallback base points if GET /api/points is unavailable (matches #28 config). */
const DEFAULT_BASE_POINTS: Record<TaskComplexity, number> = { low: 2, medium: 5, high: 10 }

const COMPLEXITY_ORDER: TaskComplexity[] = ['low', 'medium', 'high']
const COMPLEXITY_LABEL: Record<TaskComplexity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

// Mirror the server's CRUD validation (#27) so we fail fast client-side.
const MAX_TITLE = 255
const MAX_MINUTES = 100_000

/**
 * Add-task form (issue #35). Creates a task via the #27 POST /api/tasks endpoint.
 * Fields (title, complexity, estimated minutes) and validation mirror the CRUD
 * rules. The complexity picker shows base points up front (a decided principle:
 * points are always visible). Reachable from the empty state and Home.
 */
export function AddTask() {
  const navigate = useNavigate()
  const [basePoints, setBasePoints] = useState(DEFAULT_BASE_POINTS)
  const [title, setTitle] = useState('')
  const [complexity, setComplexity] = useState<TaskComplexity>('medium')
  const [minutes, setMinutes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [addedTitle, setAddedTitle] = useState<string | null>(null)

  useEffect(() => {
    fetchPoints()
      .then((p) => setBasePoints(p.basePoints))
      .catch(() => undefined) // fall back to defaults; the picker is still usable
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = title.trim()
    if (trimmed.length < 1 || trimmed.length > MAX_TITLE) {
      setError('Give the task a title (up to 255 characters).')
      return
    }
    const mins = Number(minutes)
    if (!Number.isInteger(mins) || mins < 1 || mins > MAX_MINUTES) {
      setError('Estimated time must be a whole number of minutes (at least 1).')
      return
    }

    setSubmitting(true)
    try {
      await createTask({ title: trimmed, complexity, estimatedMinutes: mins })
      setAddedTitle(trimmed)
      // Reset for a possible "add another".
      setTitle('')
      setComplexity('medium')
      setMinutes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the task')
    } finally {
      setSubmitting(false)
    }
  }

  if (addedTitle) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-800">Task added ✓</h1>
        <p className="text-gray-500">
          <span className="font-semibold">{addedTitle}</span> is in your backlog.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setAddedTitle(null)}
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Add another
          </button>
          <Link
            to="/play"
            className="rounded-lg bg-[#D85A30] px-6 py-3 font-semibold text-white transition hover:bg-[#c24d27]"
          >
            Let&apos;s play
          </Link>
          <Link to="/" className="text-sm text-gray-500 underline hover:text-gray-700">
            Back home
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="mb-5 text-center text-2xl font-bold text-gray-800">Add a task</h1>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-600">
              What needs doing?
            </label>
            <input
              id="title"
              type="text"
              value={title}
              maxLength={MAX_TITLE}
              placeholder="e.g. Draft the sprint notes"
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-[#D85A30] focus:outline-none"
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-600">How much effort?</span>
            <div className="grid grid-cols-3 gap-2">
              {COMPLEXITY_ORDER.map((c) => {
                const active = complexity === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setComplexity(c)}
                    className={`rounded-lg border-2 py-2 text-center transition ${
                      active
                        ? 'border-[#D85A30] bg-[#D85A30]/10'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-sm font-semibold text-gray-800">{COMPLEXITY_LABEL[c]}</div>
                    <div className="text-xs text-gray-500">{basePoints[c]} pts</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor="minutes" className="mb-1 block text-sm font-medium text-gray-600">
              Estimated time (minutes)
            </label>
            <input
              id="minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MINUTES}
              value={minutes}
              placeholder="e.g. 25"
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-[#D85A30] focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              Beat your estimate to earn a speed bonus.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#D85A30] py-3 font-semibold text-white transition hover:bg-[#c24d27] disabled:bg-gray-400"
          >
            {submitting ? 'Adding…' : 'Add task'}
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <button onClick={() => navigate(-1)} className="text-gray-500 underline hover:text-gray-700">
            Cancel
          </button>
          <Link to="/" className="text-gray-500 underline hover:text-gray-700">
            Home
          </Link>
        </div>
      </div>
    </main>
  )
}
