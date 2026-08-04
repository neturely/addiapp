import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  CircleCheck,
  Flame,
  Mountain,
  Play,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { ApiError } from '@/lib/apiError'
import { projectPole } from '@/lib/projectColors'
import { fetchPoints, type PointsStats } from '@/lib/points'
import { fetchCategories, type Category } from '@/lib/categories'
import { fetchProjects, type Project } from '@/lib/projects'
import {
  createTask,
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
/** Effort tiles (#256 review, Choice-option style): light fill + coloured icon
 *  + dark label; the SELECTED tile takes its hue's pastel tint (no ring). */
const EFFORT_TILE: Record<
  TaskComplexity,
  { Icon: LucideIcon; icon: string; checked: string }
> = {
  low: { Icon: Zap, icon: 'text-success', checked: 'bg-success-tint' },
  medium: { Icon: Flame, icon: 'text-warning', checked: 'bg-warning-tint' },
  high: { Icon: Mountain, icon: 'text-primary', checked: 'bg-primary-tint' },
}
const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Ready', // presentation label; enum value stays `backlog` (#178)
  in_progress: 'Started',
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
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()

  // Create mode (#256 review — replaces the AddTask page): /tasks/new renders
  // this same view with blank fields; `?project=ID` pre-assigns (project card's
  // "Add task"), and `state.from` returns you where you came from (EmptyState).
  const creating = id === undefined
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [task, setTask] = useState<Task | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [points, setPoints] = useState<PointsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [title, setTitle] = useState('')
  const [complexity, setComplexity] = useState<TaskComplexity>('medium')
  const [minutes, setMinutes] = useState('')
  // 'archived' (#330) is the #312 axis presented AS a status: a filed task
  // shows it; picking a real status un-files (the edit page IS the unarchive
  // path — the archive tab only offers Delete).
  const [status, setStatus] = useState<TaskStatus | 'archived'>('backlog')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [categoryId, setCategoryId] = useState<number | ''>('')

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (creating) {
      const preselect = Number(searchParams.get('project'))
      const preselectCategory = Number(searchParams.get('category'))
      // 'all' (#310): done/archived projects are assignable too — picking one
      // reactivates it server-side, so the select lists every owned project.
      Promise.all([fetchProjects('all'), fetchCategories(), fetchPoints()])
        .then(([p, cats, pts]) => {
          if (cancelled) return
          setProjects(p)
          setCategories(cats)
          setPoints(pts)
          // Pre-assign only when the id resolves to an owned project/category.
          if (p.some((proj) => proj.id === preselect)) setProjectId(preselect)
          if (cats.some((c) => c.id === preselectCategory)) setCategoryId(preselectCategory)
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load'))
        .finally(() => !cancelled && setLoading(false))
      return () => {
        cancelled = true
      }
    }

    const taskId = Number(id)
    if (!Number.isInteger(taskId) || taskId <= 0) {
      setNotFound(true)
      setLoading(false)
      return
    }
    Promise.all([getTask(taskId), fetchProjects('all'), fetchCategories(), fetchPoints()])
      .then(([t, p, cats, pts]) => {
        if (cancelled) return
        setTask(t)
        setProjects(p)
        setCategories(cats)
        setPoints(pts)
        setTitle(t.title)
        setComplexity(t.complexity)
        setMinutes(String(t.estimatedMinutes))
        setStatus(t.archivedAt ? 'archived' : t.status)
        setDescription(t.description ?? '')
        setProjectId(t.projectId ?? '')
        setCategoryId(t.categoryId ?? '')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, creating])

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
    if (!creating && !task) return
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
      if (creating) {
        await createTask({
          title: trimmed,
          complexity,
          estimatedMinutes: mins,
          description: description.trim(),
          ...(projectId !== '' ? { projectId } : {}),
          ...(categoryId !== '' ? { categoryId } : {}),
        })
        showToast({ message: `Task added: ${trimmed}`, icon: CircleCheck, tone: 'success' })
        // Create always lands on the dashboard (#256 review) — the Back button
        // still honours `from` for a cancel.
        navigate('/dashboard')
        return
      }
      const updated = await updateTask(task!.id, {
        // 'archived' isn't a real status: keep 'done' and leave the flag alone.
        // Any REAL status picked on a filed task un-files it — explicit
        // archived:false covers staying 'done' (the #312 invariant already
        // clears it when leaving 'done').
        ...(status === 'archived'
          ? { status: 'done' as TaskStatus }
          : { status, ...(task!.archivedAt ? { archived: false } : {}) }),
        title: trimmed,
        complexity,
        estimatedMinutes: mins,
        description: description.trim(),
        // #236 semantics: an int assigns to an active owned project; null unassigns.
        projectId: projectId === '' ? null : projectId,
        // #276: same null-unlabels semantics for the category axis.
        categoryId: categoryId === '' ? null : categoryId,
      })
      setTask({ ...task!, ...updated })
      setStatus(updated.archivedAt ? 'archived' : updated.status)
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
  if (!creating && (notFound || !task)) {
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
    ? Math.floor(Number(minutes || task?.estimatedMinutes || 0) * points.speedBonus.saturation)
    : undefined
  const added = addedLabel(task?.createdAt)

  return (
    <main className="flex min-h-screen flex-col p-4 sm:p-6">
      {/* Top bar: back on the left; the project/added eyebrow sits top right —
          the spot the dashboard's pager occupies (#256 review). */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => navigate(from)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {creating ? 'Back' : 'All tasks'}
        </Button>
        <div className="flex items-center gap-2 px-1 text-xs text-muted">
          {/* Filed-away indicator (#332) — the archived state visible at a
              glance, beyond the Status select. */}
          {!creating && task?.archivedAt && (
            <span className="rounded-full bg-field px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              Archived
            </span>
          )}
          <span
            className={`h-2.5 w-2.5 flex-none rounded-[3px] ${project ? projectPole(project.color) : 'bg-gray-300'}`}
            aria-hidden
          />
          <span>
            {creating ? 'New task' : (project?.name ?? 'No project')}
            {!creating && added ? ` · ${added}` : ''}
          </span>
        </div>
      </div>

      <form onSubmit={save} className="flex-1 rounded-xl bg-surface">
        {/* mx-auto (#256 review): centre the content column in the full-width
            surface so the whitespace is symmetric, not all on the right. */}
        <div className="mx-auto max-w-3xl px-6 py-8 sm:px-9">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            aria-label="Title"
            placeholder={creating ? 'What needs doing?' : undefined}
            // -ml only (not -mx): a full-width input with symmetric negative
            // margins overflows a 375px viewport (#270).
            className="-ml-2 mb-6 w-full rounded-control bg-transparent px-2 py-1 text-2xl font-bold tracking-tight text-gray-900 placeholder:text-gray-300 hover:bg-field focus:bg-field focus:outline-none"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="task-project" className={FIELD_LABEL}>
                Project
              </label>
              {/* Grouped Active / Done / Archived (#310) — picking a non-active
                  project is a deliberate reactivation, so it's labelled. */}
              <select
                id="task-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
                className={FIELD}
              >
                <option value="">No project</option>
                {(
                  [
                    ['Active', projects.filter((p) => p.status === 'active')],
                    ['Done', projects.filter((p) => p.status === 'done')],
                    ['Archived', projects.filter((p) => p.status === 'archived')],
                  ] as const
                )
                  .filter(([, group]) => group.length > 0)
                  .map(([label, group]) => (
                    <optgroup key={label} label={label}>
                      {group.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="task-category" className={FIELD_LABEL}>
                Category
              </label>
              {/* User-defined lists (#276) — flat set, no lifecycle groups. */}
              <select
                id="task-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
                className={FIELD}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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

            {/* Status sits beside Estimate (#330 — was stranded below the
                Difficulty tiles leaving dead space here). A filed task shows
                "Archived"; picking a real status un-files it on save. */}
            <div className={`flex flex-col gap-1.5 ${creating ? 'hidden' : ''}`}>
              <label htmlFor="task-status" className={FIELD_LABEL}>
                Status
              </label>
              <select
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus | 'archived')}
                className={FIELD}
              >
                {task?.archivedAt && <option value="archived">Archived</option>}
                {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span id="task-difficulty-label" className={FIELD_LABEL}>
                Difficulty
              </span>
              <div
                role="radiogroup"
                aria-labelledby="task-difficulty-label"
                className="grid grid-cols-3 gap-2"
              >
                {COMPLEXITY_ORDER.map((c, i) => {
                  const checked = complexity === c
                  const { Icon, icon, checked: checkedFill } = EFFORT_TILE[c]
                  return (
                    <button
                      key={c}
                      ref={(el) => {
                        segRefs.current[i] = el
                      }}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-label={
                        points ? `${COMPLEXITY_LABEL[c]} — ${points.basePoints[c]} points` : COMPLEXITY_LABEL[c]
                      }
                      tabIndex={checked ? 0 : -1}
                      onClick={() => setComplexity(c)}
                      onKeyDown={(e) => onSegKeyDown(e, i)}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left transition ${
                        checked ? checkedFill : 'bg-page/70 hover:bg-field'
                      }`}
                    >
                      <Icon
                        className={`h-6 w-6 flex-none ${icon}`}
                        fill={c === 'low' ? 'currentColor' : 'none'}
                        strokeWidth={c === 'low' ? 0 : 2.25}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-800">
                          {COMPLEXITY_LABEL[c]}
                        </span>
                        {points && (
                          <span className="block text-xs text-muted">
                            {points.basePoints[c]} pts
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
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

          {status !== 'done' && status !== 'archived' && base !== undefined && (
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
              {saving ? 'Saving…' : creating ? 'Add task' : 'Save changes'}
            </Button>
            {!creating && (
              <Button
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
                className="hover:bg-danger-tint hover:text-danger-ink"
              >
                Delete
              </Button>
            )}
            <span className="flex-1" aria-hidden />
            {!creating && status !== 'done' && status !== 'archived' && (
              <Button onClick={() => void startNow()}>
                <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden />
                {task?.status === 'in_progress' ? 'Resume' : 'Start now'}
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
            “{task?.title}” will be permanently deleted.
            {task?.status === 'done' ? ' Points already earned from it are kept.' : ''}
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
