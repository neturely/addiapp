import { useEffect, useState, type FormEvent } from 'react'
import { type TaskComplexity } from '@/lib/tasks'
import { fetchPoints } from '@/lib/points'

/** Fallback base points if GET /api/points is unavailable (matches #28 config). */
const DEFAULT_BASE_POINTS: Record<TaskComplexity, number> = { low: 2, medium: 5, high: 10 }
const COMPLEXITY_ORDER: TaskComplexity[] = ['low', 'medium', 'high']
const COMPLEXITY_LABEL: Record<TaskComplexity, string> = { low: 'Low', medium: 'Medium', high: 'High' }

// Mirror the server's CRUD validation (#27) so we fail fast client-side.
const MAX_TITLE = 255
const MAX_MINUTES = 100_000

export type TaskFormValues = {
  title: string
  complexity: TaskComplexity
  estimatedMinutes: number
}

type TaskFormProps = {
  initial?: Partial<TaskFormValues>
  submitLabel: string
  submittingLabel: string
  onSubmit: (values: TaskFormValues) => Promise<void>
}

/**
 * Shared task fields form (title, complexity, estimated minutes) used by both the
 * add-task screen (#35) and the dashboard edit page (#36). Keeping the fields in
 * one place is deliberate future-proofing: when categories / tags / due dates /
 * priorities land, they get added here once and appear in both create and edit.
 */
export function TaskForm({ initial, submitLabel, submittingLabel, onSubmit }: TaskFormProps) {
  const [basePoints, setBasePoints] = useState(DEFAULT_BASE_POINTS)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [complexity, setComplexity] = useState<TaskComplexity>(initial?.complexity ?? 'medium')
  const [minutes, setMinutes] = useState(
    initial?.estimatedMinutes != null ? String(initial.estimatedMinutes) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchPoints()
      .then((p) => setBasePoints(p.basePoints))
      .catch(() => undefined) // fall back to defaults; the picker is still usable
  }, [])

  async function handle(e: FormEvent) {
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
      await onSubmit({ title: trimmed, complexity, estimatedMinutes: mins })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handle} className="space-y-5">
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
          className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
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
                className={`rounded-lg py-2 text-center transition ${
                  active ? 'bg-primary-tint' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <div className={`text-sm font-semibold ${active ? 'text-primary-ink' : 'text-gray-800'}`}>
                  {COMPLEXITY_LABEL[c]}
                </div>
                <div className="text-xs text-muted">{basePoints[c]} pts</div>
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
          className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted">Beat your estimate to earn a speed bonus.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-primary py-3 font-semibold text-on-primary transition hover:opacity-90 disabled:bg-gray-400"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  )
}
