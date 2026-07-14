import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  deleteTask,
  fetchTasks,
  startTask,
  updateTask,
  type Task,
  type TaskComplexity,
  type TaskStatus,
} from '@/lib/tasks'
import { PointsCard } from '@/components/PointsCard'

type Filter = 'all' | TaskStatus

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
]

const COMPLEXITY_TAG: Record<TaskComplexity, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-success-tint text-success' },
  medium: { label: 'Medium', className: 'bg-warning-tint text-[#8a5a00]' },
  high: { label: 'High', className: 'bg-primary-tint text-primary' },
}

const STATUS_BADGE: Record<TaskStatus, { label: string; className: string }> = {
  backlog: { label: 'Backlog', className: 'bg-gray-100 text-muted' },
  in_progress: { label: 'In progress', className: 'bg-warning-tint text-[#8a5a00]' },
  done: { label: 'Done', className: 'bg-success-tint text-success' },
}

const MAX_TITLE = 255
const MAX_MINUTES = 100_000
const UNDO_MS = 5000

const byIdDesc = (a: Task, b: Task) => b.id - a.id

type EditValues = {
  title: string
  complexity: TaskComplexity
  estimatedMinutes: string
  status: TaskStatus
}

/**
 * Dashboard (issue #36) — the Todoist/Linear-style admin surface. Lists the
 * user's tasks with status filter tabs; the four column fields are editable
 * inline; a per-row Edit action opens the full edit page (#36) for future
 * fields. Start (backlog) / Resume (in-progress) are the manual selection entry
 * into the guided in-progress screen (#33). Delete uses an undo toast — no
 * blocking dialog to interrupt inline editing; the API delete is deferred until
 * the undo window closes.
 */
export function Dashboard() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [pointsRefresh, setPointsRefresh] = useState(0)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<EditValues | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  const [pendingTask, setPendingTask] = useState<Task | null>(null)
  const pendingRef = useRef<{ task: Task; timer: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTasks()
      .then((rows) => !cancelled && setTasks([...rows].sort(byIdDesc)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load tasks'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Commit any deferred delete to the server; restore the row if it fails.
  function commitPending() {
    const p = pendingRef.current
    if (!p) return
    clearTimeout(p.timer)
    pendingRef.current = null
    setPendingTask(null)
    deleteTask(p.task.id).catch(() => {
      setTasks((prev) => [...prev, p.task].sort(byIdDesc))
      setError('Could not delete that task — it has been restored.')
    })
  }

  // Clean up a still-pending delete on unmount (fail-safe: the task survives).
  useEffect(() => {
    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current.timer)
    }
  }, [])

  function onDelete(task: Task) {
    commitPending() // flush any earlier pending delete first
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    if (editingId === task.id) setEditingId(null)
    const timer = window.setTimeout(commitPending, UNDO_MS)
    pendingRef.current = { task, timer }
    setPendingTask(task)
  }

  function undoDelete() {
    const p = pendingRef.current
    if (!p) return
    clearTimeout(p.timer)
    pendingRef.current = null
    setPendingTask(null)
    setTasks((prev) => [...prev, p.task].sort(byIdDesc))
  }

  function startEdit(task: Task) {
    setRowError(null)
    setEditingId(task.id)
    setEditValues({
      title: task.title,
      complexity: task.complexity,
      estimatedMinutes: String(task.estimatedMinutes),
      status: task.status,
    })
  }

  async function saveEdit(task: Task) {
    if (!editValues) return
    const title = editValues.title.trim()
    if (title.length < 1 || title.length > MAX_TITLE) {
      setRowError('Title is required (up to 255 characters).')
      return
    }
    const mins = Number(editValues.estimatedMinutes)
    if (!Number.isInteger(mins) || mins < 1 || mins > MAX_MINUTES) {
      setRowError('Estimated minutes must be a whole number ≥ 1.')
      return
    }

    // Only send changed fields — avoids re-triggering status-transition side effects.
    const patch: Parameters<typeof updateTask>[1] = {}
    if (title !== task.title) patch.title = title
    if (editValues.complexity !== task.complexity) patch.complexity = editValues.complexity
    if (mins !== task.estimatedMinutes) patch.estimatedMinutes = mins
    if (editValues.status !== task.status) patch.status = editValues.status

    if (Object.keys(patch).length === 0) {
      setEditingId(null)
      return
    }

    setSavingId(task.id)
    setRowError(null)
    try {
      const updated = await updateTask(task.id, patch)
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)).sort(byIdDesc))
      setEditingId(null)
      // A status change may have awarded points — refresh the summary card.
      if (patch.status) setPointsRefresh((n) => n + 1)
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not save changes.')
    } finally {
      setSavingId(null)
    }
  }

  async function onStart(task: Task) {
    try {
      await startTask(task.id)
      navigate(`/play/progress/${task.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the task')
    }
  }

  const visible = (filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)).sort(byIdDesc)

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
      </header>

      <PointsCard refreshSignal={pointsRefresh} />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const count =
            f.key === 'all' ? tasks.length : tasks.filter((t) => t.status === f.key).length
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                active ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-primary-tint'
              }`}
            >
              {f.label} <span className={active ? 'text-white' : 'text-muted'}>{count}</span>
            </button>
          )
        })}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="p-8 text-center text-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-surface p-10 text-center">
          <p className="text-muted">
            {tasks.length === 0 ? 'No tasks yet.' : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} tasks.`}
          </p>
          <Link to="/tasks/new" className="mt-2 inline-block text-sm text-primary underline">
            Add a task
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Effort</th>
                <th className="px-4 py-3 font-medium">Est.</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => {
                const editing = editingId === task.id && editValues
                if (editing) {
                  return (
                    <tr key={task.id} className="bg-primary-tint align-top">
                      <td className="px-4 py-2">
                        <input
                          autoFocus
                          value={editValues.title}
                          maxLength={MAX_TITLE}
                          onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                          className="w-full rounded bg-gray-100 p-1.5"
                        />
                        {rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editValues.complexity}
                          onChange={(e) =>
                            setEditValues({ ...editValues, complexity: e.target.value as TaskComplexity })
                          }
                          className="rounded bg-gray-100 p-1.5"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={1}
                          max={MAX_MINUTES}
                          value={editValues.estimatedMinutes}
                          onChange={(e) =>
                            setEditValues({ ...editValues, estimatedMinutes: e.target.value })
                          }
                          className="w-20 rounded bg-gray-100 p-1.5"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editValues.status}
                          onChange={(e) =>
                            setEditValues({ ...editValues, status: e.target.value as TaskStatus })
                          }
                          className="rounded bg-gray-100 p-1.5"
                        >
                          <option value="backlog">Backlog</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => void saveEdit(task)}
                          disabled={savingId === task.id}
                          className="rounded bg-primary px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:bg-gray-400"
                        >
                          {savingId === task.id ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null)
                            setRowError(null)
                          }}
                          className="ml-2 text-xs text-muted underline hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  )
                }

                const tag = COMPLEXITY_TAG[task.complexity]
                const badge = STATUS_BADGE[task.status]
                return (
                  <tr key={task.id} className="even:bg-gray-50 hover:bg-primary-tint">
                    <td
                      onClick={() => startEdit(task)}
                      className="cursor-pointer px-4 py-3 font-medium text-gray-800"
                      title="Click to edit"
                    >
                      {task.title}
                    </td>
                    <td onClick={() => startEdit(task)} className="cursor-pointer px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tag.className}`}>
                        {tag.label}
                      </span>
                    </td>
                    <td onClick={() => startEdit(task)} className="cursor-pointer px-4 py-3 text-muted">
                      {task.estimatedMinutes}m
                    </td>
                    <td onClick={() => startEdit(task)} className="cursor-pointer px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {task.status === 'backlog' && (
                        <button
                          onClick={() => void onStart(task)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Start
                        </button>
                      )}
                      {task.status === 'in_progress' && (
                        <Link
                          to={`/play/progress/${task.id}`}
                          className="text-xs font-semibold text-[#8a5a00] hover:underline"
                        >
                          Resume
                        </Link>
                      )}
                      <Link
                        to={`/tasks/${task.id}/edit`}
                        className="ml-3 text-xs text-muted hover:underline"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => onDelete(task)}
                        className="ml-3 text-xs text-muted hover:text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pendingTask && (
        <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white">
          <span>
            Deleted “{pendingTask.title.length > 32 ? pendingTask.title.slice(0, 32) + '…' : pendingTask.title}”
          </span>
          <button onClick={undoDelete} className="font-semibold text-warning hover:underline">
            Undo
          </button>
        </div>
      )}
    </main>
  )
}
