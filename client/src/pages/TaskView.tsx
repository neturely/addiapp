import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, CircleCheck, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { ApiError } from '@/lib/apiError'
import { projectPole } from '@/lib/projectColors'
import { fetchPoints, type PointsStats } from '@/lib/points'
import { fetchProjects, type Project } from '@/lib/projects'
import {
  deleteTask,
  getTask,
  startTask,
  updateTask,
  type Task,
  type TaskComplexity,
  type TaskStatus,
} from '@/lib/tasks'
import { useToast } from '@/toast/useToast'

const MAX_TITLE = 255
const MAX_MINUTES = 100_000
const MAX_DESCRIPTION = 1000

const COMPLEXITY_ORDER: TaskComplexity[] = ['low', 'medium', 'high']
const COMPLEXITY_LABEL: Record<TaskComplexity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}
const SEG_CHECKED: Record<TaskComplexity, string> = {
  low: 'bg-accent-tint text-accent-ink font-semibold',
  medium: 'bg-warning-tint text-warning-ink font-semibold',
  high: 'bg-primary-tint text-primary-ink font-semibold',
}
const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'To do', // presentation label; enum value stays `backlog` (#178)
  in_progress: 'In progress',
  done: 'Done',
}

/** "added today" / "added N days ago" for the eyebrow line. */
function addedLabel(createdAt: string | undefined): string | null {
  if (!createdAt) return null
  const days = Math.floor((Date.now() - Date.parse(createdAt)) / 86_400_000)
  if (days <= 0) return 'added today'
  if (days === 1) return 'added yesterday'
  return `added ${days} days ago`
}

const FIELD =
  'h-10 w-full rounded-control bg-field px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-accent'
const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted'
const DELETE_TITLE_ID = 'task-delete-title'

/**
 * The open-in-place task view (#262) — THE one edit path, replacing the old
 * inline row-swap edit, the #218 desktop modal, and the /tasks/:id/edit page
 * (which now lands here). A page surface inside the shell: back bar → editable
 * title → a field grid → the points-forecast panel → Save / Delete / Start.
 *
 * The grid is deliberately open-ended (epic #256 amendment): future fields
 * (recurring rules #250, snooze-until, …) slot in as more grid cells — don't
 * design additions tight to today's set.
 */
export function TaskView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [task, setTask] = useState<Task | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [points, setPoints] = useState<PointsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [title, setTitle] = useState('')
  const [complexity, setComplexity] = useState<TaskComplexity>('medium')
  const [minutes, setMinutes] = useState('')
  const [status, setStatus] = useState<TaskStatus>('backlog')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState<number | ''>('')

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const taskId = Number(id)
    if (!Number.isInteger(taskId) || taskId <= 0) {
      setNotFound(true)
      setLoading(false)
      return
    }
    let cancelled = false
    Promise.all([getTask(taskId), fetchProjects(), fetchPoints()])
      .then(([t, p, pts]) => {
        if (cancelled) return
        setTask(t)
        setProjects(p)
        setPoints(pts)
        setTitle(t.title)
        setComplexity(t.complexity)
        setMinutes(String(t.estimatedMinutes))
        setStatus(t.status)
        setDescription(t.description ?? '')
        setProjectId(t.projectId ?? '')
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404) setNotFound(true)
        else setError(e instanceof Error ? e.message : 'Could not load the task')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  // Roving-tabindex radiogroup for the difficulty segment (#126 pattern).
  const segRefs = useRef<(HTMLButtonElement | null)[]>([])
  function onSegKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = COMPLEXITY_ORDER.length - 1
    let next = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else return
    e.preventDefault()
    setComplexity(COMPLEXITY_ORDER[next])
    segRefs.current[next]?.focus()
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!task) return
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
    setSaving(true)
    try {
      const updated = await updateTask(task.id, {
        title: trimmed,
        complexity,
        estimatedMinutes: mins,
        status,
        description: description.trim(),
        // #236 semantics: an int assigns to an active owned project; null unassigns.
        projectId: projectId === '' ? null : projectId,
      })
      setTask({ ...task, ...updated })
      setStatus(updated.status)
      showToast({ message: 'Task saved', icon: CircleCheck, tone: 'success' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the task.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!task) return
    setDeleting(true)
    try {
      await deleteTask(task.id)
      showToast({ message: `Task deleted: ${task.title}`, icon: Trash2, tone: 'neutral' })
      navigate('/dashboard')
    } catch (err) {
      setConfirmingDelete(false)
      setError(err instanceof Error ? err.message : 'Could not delete the task.')
    } finally {
      setDeleting(false)
    }
  }

  async function startNow() {
    if (!task) return
    setError(null)
    try {
      const started = task.status === 'in_progress' ? task : await startTask(task.id)
      navigate(`/play/progress/${started.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the task.')
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <span role="status">Loading…</span>
      </main>
    )
  }
  if (notFound || !task) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-gray-700">That task doesn’t exist.</p>
        <Link to="/dashboard" className="text-sm text-muted underline hover:text-gray-700">
          Back to the dashboard
        </Link>
      </main>
    )
  }

  const project = projectId !== '' ? projects.find((p) => p.id === projectId) : undefined
  const base = points?.basePoints[complexity]
  const speedMax =
    base !== undefined && points ? Math.round(base * points.speedBonus.maxRatio) : undefined
  const bonusMinutes = points
    ? Math.floor(Number(minutes || task.estimatedMinutes) * points.speedBonus.saturation)
    : undefined
  const added = addedLabel(task.createdAt)

  return (
    <main className="flex min-h-screen flex-col p-4 sm:p-6">
      <div className="mb-3">
        <Button variant="secondary" onClick={() => navigate('/dashboard')}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All tasks
        </Button>
      </div>

      <form onSubmit={save} className="flex-1 rounded-xl bg-surface">
        <div className="max-w-3xl px-6 py-8 sm:px-9">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted">
            <span
              className={`h-2.5 w-2.5 flex-none rounded-[3px] ${project ? projectPole(project.color) : 'bg-gray-300'}`}
              aria-hidden
            />
            <span>
              {project?.name ?? 'No project'}
              {added ? ` · ${added}` : ''}
            </span>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            aria-label="Title"
            // -ml only (not -mx): a full-width input with symmetric negative
            // margins overflows a 375px viewport (#270).
            className="-ml-2 mb-6 w-full rounded-control bg-transparent px-2 py-1 text-2xl font-bold tracking-tight text-gray-900 hover:bg-field focus:bg-field focus:outline-none"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="task-project" className={FIELD_LABEL}>
                Project
              </label>
              <select
                id="task-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
                className={FIELD}
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="task-minutes" className={FIELD_LABEL}>
                Estimate (minutes)
              </label>
              <input
                id="task-minutes"
                type="number"
                min={1}
                max={MAX_MINUTES}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className={FIELD}
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span id="task-difficulty-label" className={FIELD_LABEL}>
                Difficulty
              </span>
              <div
                role="radiogroup"
                aria-labelledby="task-difficulty-label"
                className="flex gap-1.5"
              >
                {COMPLEXITY_ORDER.map((c, i) => {
                  const checked = complexity === c
                  return (
                    <button
                      key={c}
                      ref={(el) => {
                        segRefs.current[i] = el
                      }}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      tabIndex={checked ? 0 : -1}
                      onClick={() => setComplexity(c)}
                      onKeyDown={(e) => onSegKeyDown(e, i)}
                      className={`h-10 flex-1 cursor-pointer rounded-control text-sm transition ${
                        checked ? SEG_CHECKED[c] : 'bg-field text-gray-700 hover:bg-field-hover'
                      }`}
                    >
                      {COMPLEXITY_LABEL[c]}
                      {points ? ` · ${points.basePoints[c]} pts` : ''}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="task-status" className={FIELD_LABEL}>
                Status
              </label>
              <select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={FIELD}
              >
                {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="task-description" className={FIELD_LABEL}>
                Description
              </label>
              <textarea
                id="task-description"
                rows={3}
                maxLength={MAX_DESCRIPTION}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-y rounded-control bg-field p-3 text-sm leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          {status !== 'done' && base !== undefined && (
            <div className="mt-6 flex items-center gap-4 rounded-xl bg-success-tint px-4 py-3.5 text-success-ink">
              <div className="text-2xl font-bold tabular-nums tracking-tight">{base}</div>
              <p className="text-sm leading-relaxed">
                base points, plus up to <strong>{speedMax}</strong> speed bonus if you finish
                inside {bonusMinutes} minutes. Today’s multiplier of ×
                {+(points?.today.currentMultiplier ?? 1).toFixed(2)} applies on completion.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 text-sm text-danger-ink">
              {error}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              className="hover:bg-danger-tint hover:text-danger-ink"
            >
              Delete
            </Button>
            <span className="flex-1" aria-hidden />
            {status !== 'done' && (
              <Button onClick={() => void startNow()}>
                <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden />
                {task.status === 'in_progress' ? 'Resume' : 'Start now'}
              </Button>
            )}
          </div>
        </div>
      </form>

      {confirmingDelete && (
        <Modal titleId={DELETE_TITLE_ID} onClose={() => setConfirmingDelete(false)}>
          <h2 id={DELETE_TITLE_ID} className="mb-3 text-xl font-bold text-gray-800">
            Delete this task?
          </h2>
          <p className="mb-5 text-sm leading-relaxed text-gray-700">
            “{task.title}” will be permanently deleted.
            {task.status === 'done' ? ' Points already earned from it are kept.' : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? 'Deleting…' : 'Delete task'}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  )
}
