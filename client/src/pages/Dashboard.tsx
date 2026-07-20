import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  deleteTask,
  fetchTasksPage,
  startTask,
  updateTask,
  type Task,
  type TaskComplexity,
  type TaskCounts,
  type TaskStatus,
} from '@/lib/tasks'
import { PointsCard } from '@/components/PointsCard'
import { EditTaskModal } from '@/components/EditTaskModal'

type Filter = 'all' | TaskStatus

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'backlog', label: 'To do' }, // presentation label; enum value stays `backlog` (#178)
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
]

// Brighter, more-saturated badge tints (#178) — dark on-fill text keeps them AA
// (the pale `-ink`-on-`-tint` pairing couldn't go brighter without dropping below
// 4.5:1). Colored, but deliberately NOT solid-vivid (reserved for singular
// emphasis) so a dense table stays scannable.
const COMPLEXITY_TAG: Record<TaskComplexity, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-[#bfe9cd] text-on-success' },
  medium: { label: 'Medium', className: 'bg-[#ffe3a0] text-on-warning' },
  high: { label: 'High', className: 'bg-[#ffcdb8] text-on-primary' },
}

// `backlog` shows as "To do" with its own violet/accent identity (was muted grey).
const STATUS_BADGE: Record<TaskStatus, { label: string; className: string }> = {
  backlog: { label: 'To do', className: 'bg-[#ddd0fa] text-on-accent' },
  in_progress: { label: 'In progress', className: 'bg-[#ffe3a0] text-on-warning' },
  done: { label: 'Done', className: 'bg-[#bfe9cd] text-on-success' },
}

// Sortable columns (#178). Default: most-recently-created first (id desc).
type SortKey = 'created' | 'title' | 'effort' | 'est' | 'status'
const EFFORT_ORDER: Record<TaskComplexity, number> = { low: 0, medium: 1, high: 2 }
const STATUS_ORDER: Record<TaskStatus, number> = { backlog: 0, in_progress: 1, done: 2 }

function compareBy(a: Task, b: Task, key: SortKey): number {
  switch (key) {
    case 'title':
      return a.title.localeCompare(b.title)
    case 'effort':
      return EFFORT_ORDER[a.complexity] - EFFORT_ORDER[b.complexity]
    case 'est':
      return a.estimatedMinutes - b.estimatedMinutes
    case 'status':
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    case 'created':
    default:
      return a.id - b.id
  }
}

const MAX_TITLE = 255
const MAX_MINUTES = 100_000
const UNDO_MS = 5000
const PAGE_SIZE = 25 // dashboard keyset page size (#100)

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
  // Latest filter for the deferred delete/undo paths (#100): those fire from a
  // timer or after a tab switch, so they must read the CURRENT filter, not the one
  // captured when the timer was armed.
  const filterRef = useRef<Filter>(filter)
  filterRef.current = filter
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'created',
    dir: 'desc',
  })
  const [pointsRefresh, setPointsRefresh] = useState(0)

  // Keyset pagination state (#100): `tasks` holds the loaded rows for the current
  // filter (server-side), `counts` the per-status totals for the tab bar, and
  // `nextCursor` the id to page from (null = fully loaded).
  const [counts, setCounts] = useState<TaskCounts | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const [expandedId, setExpandedId] = useState<number | null>(null) // description row (#184)
  const [editModalTask, setEditModalTask] = useState<Task | null>(null) // desktop edit modal (#218)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<EditValues | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  const [pendingTask, setPendingTask] = useState<Task | null>(null)
  const pendingRef = useRef<{ task: Task; timer: number } | null>(null)

  // Load (or reload) the first page whenever the filter changes (#100). Server-side
  // filtering means a tab switch is a fresh first-page query — its own cursor +
  // counts. The `cancelled` guard drops a stale response if the user switches tabs
  // again before the request lands.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTasksPage({ status: filter === 'all' ? undefined : filter, limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return
        setTasks(page.tasks) // already id DESC from the server
        setNextCursor(page.nextCursor)
        if (page.counts) setCounts(page.counts)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load tasks'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filter])

  async function loadMore() {
    if (nextCursor == null || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await fetchTasksPage({
        status: filter === 'all' ? undefined : filter,
        limit: PAGE_SIZE,
        before: nextCursor,
      })
      setTasks((prev) => [...prev, ...page.tasks])
      setNextCursor(page.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load more tasks')
    } finally {
      setLoadingMore(false)
    }
  }

  // Keep the cached tab counts (#100) in sync with client-side mutations so they
  // don't drift until the next tab switch.
  function adjustCounts(status: TaskStatus, delta: number) {
    setCounts((c) => (c ? { ...c, all: c.all + delta, [status]: c[status] + delta } : c))
  }

  // Re-insert an undone / restore-on-failure row ONLY if it belongs in the current
  // filter view (#100). `tasks` is server-filtered per tab, so appending a row
  // whose status doesn't match the active tab would mix statuses in. Counts are
  // restored separately (they're global); a later switch to a matching tab
  // re-fetches the row from the server.
  function restoreRow(task: Task) {
    if (filterRef.current === 'all' || task.status === filterRef.current) {
      setTasks((prev) => [...prev, task].sort(byIdDesc))
    }
  }

  // Commit any deferred delete to the server; restore the row if it fails.
  function commitPending() {
    const p = pendingRef.current
    if (!p) return
    clearTimeout(p.timer)
    pendingRef.current = null
    setPendingTask(null)
    deleteTask(p.task.id).catch(() => {
      restoreRow(p.task)
      adjustCounts(p.task.status, 1) // undo the optimistic decrement
      setError('Could not delete that task — it has been restored.')
    })
  }

  // Finalize a still-pending delete on unmount (#112). The user chose delete and
  // didn't undo within the window, so honour it rather than dropping it — the
  // old code only cleared the timer, leaving the task alive though the UI already
  // showed it gone. Fire-and-forget: the component is unmounting, so there's no
  // row to restore on failure. Nulling the ref + clearing the timer prevents any
  // double-delete from the scheduled commit.
  useEffect(() => {
    return () => {
      const p = pendingRef.current
      if (!p) return
      clearTimeout(p.timer)
      pendingRef.current = null
      deleteTask(p.task.id).catch(() => {})
    }
  }, [])

  // Pause the undo auto-dismiss while the toast is hovered or focused, so
  // keyboard/screen-reader users can reach Undo before it commits (A11Y-1, #126).
  // Resuming starts a fresh full window — generous, but the point is only that it
  // can't vanish mid-interaction.
  function pauseUndo() {
    const p = pendingRef.current
    if (p) clearTimeout(p.timer)
  }
  function resumeUndo() {
    const p = pendingRef.current
    if (!p) return
    clearTimeout(p.timer)
    p.timer = window.setTimeout(commitPending, UNDO_MS)
  }

  function onDelete(task: Task) {
    commitPending() // flush any earlier pending delete first
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    adjustCounts(task.status, -1) // optimistic; restored on undo or commit failure
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
    restoreRow(p.task)
    adjustCounts(p.task.status, 1)
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
      if (patch.status) {
        // Status changed: keep the cached tab counts in sync, and drop the row
        // from the current view if it no longer matches the active filter (#100 —
        // replicates what client-side re-filtering used to do for free).
        adjustCounts(task.status, -1)
        adjustCounts(updated.status, 1)
      }
      if (filter !== 'all' && updated.status !== filter) {
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
      } else {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)).sort(byIdDesc))
      }
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

  // `tasks` is already the server-filtered set for the active tab (#100). Sorting
  // is client-side over the LOADED rows; the default `created`/id-desc matches the
  // server order, so it's exact until a non-default sort is applied to a list with
  // more pages still to load (acceptable — "Load more" makes the partial set clear).
  const visible = [...tasks].sort((a, b) => {
    const c = compareBy(a, b, sort.key)
    return sort.dir === 'asc' ? c : -c
  })

  // Click a header to sort by it; same column toggles direction. New columns
  // start ascending, except "created" (newest-first is the useful default).
  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'created' ? 'desc' : 'asc' },
    )
  }

  function SortTh({
    colKey,
    label,
    className = '',
  }: {
    colKey: SortKey
    label: string
    className?: string
  }) {
    const active = sort.key === colKey
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`px-4 py-3 font-medium ${className}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(colKey)}
          className="inline-flex cursor-pointer items-center gap-1 uppercase tracking-wide hover:text-gray-700"
        >
          {label}
          {/* Active column shows its direction; the rest show a faint up/down
              hint so it's clear every column is sortable (#178 follow-up). */}
          {active ? (
            sort.dir === 'asc' ? (
              <ChevronUp className="h-3 w-3" aria-hidden />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden />
            )
          ) : (
            <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />
          )}
        </button>
      </th>
    )
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl p-4 sm:p-8">
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        {/* Total across every status (#174) — from the server counts (#100), not the
            loaded page, so it stays accurate when the list is paginated. */}
        <span className="text-2xl font-bold text-muted">
          {counts?.all ?? tasks.length} total {(counts?.all ?? tasks.length) === 1 ? 'thing' : 'things'} to do
        </span>
      </header>

      <PointsCard refreshSignal={pointsRefresh} />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const count = counts ? counts[f.key] : null // server counts (#100)
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`cursor-pointer rounded-full px-3 py-1 text-sm font-medium transition ${
                active
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface text-muted hover:bg-primary-tint'
              }`}
            >
              {f.label}
              {count !== null && (
                <span className={active ? ' text-on-primary' : ' text-muted'}> {count}</span>
              )}
            </button>
          )
        })}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" className="p-8 text-center text-muted">
          Loading…
        </p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-surface p-10 text-center">
          <p className="text-muted">
            {(counts?.all ?? 0) === 0
              ? 'No tasks yet.'
              : `No ${(FILTERS.find((f) => f.key === filter)?.label ?? '').toLowerCase().replace('to do', 'to-do')} tasks.`}
          </p>
          <Link
            to="/tasks/new"
            state={{ from: '/dashboard' }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xl font-bold text-white transition hover:opacity-90"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
            Add a task
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface">
          {/* table-fixed so column widths stay put when a row enters edit mode
              (its inputs are wider than the display badges) — no jump (#178). */}
          <table className="w-full min-w-[640px] table-fixed text-left text-sm">
            <caption className="sr-only">Your tasks</caption>
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <SortTh colKey="title" label="Title" />
                <SortTh colKey="effort" label="Effort" className="w-32" />
                <SortTh colKey="est" label="Est." className="w-24" />
                <SortTh colKey="status" label="Status" className="w-40" />
                <th scope="col" className="w-36 px-4 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((task, i) => {
                const editing = editingId === task.id && editValues
                if (editing) {
                  // Fixed row height (h-14) matches the display row so entering
                  // edit mode doesn't jump (#178); a one-line error fits inside it.
                  return (
                    <tr
                      key={task.id}
                      className="bg-primary-tint"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingId(null)
                          setRowError(null)
                        }
                      }}
                    >
                      <td className="h-14 px-4 align-middle">
                        <input
                          autoFocus
                          aria-label="Title"
                          value={editValues.title}
                          maxLength={MAX_TITLE}
                          onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                          className="w-full rounded bg-gray-100 p-1.5"
                        />
                        {rowError && (
                          <p role="alert" className="mt-1 text-xs text-red-600">
                            {rowError}
                          </p>
                        )}
                      </td>
                      <td className="h-14 px-4 align-middle">
                        <select
                          aria-label="Effort"
                          value={editValues.complexity}
                          onChange={(e) =>
                            setEditValues({
                              ...editValues,
                              complexity: e.target.value as TaskComplexity,
                            })
                          }
                          className="w-full rounded bg-gray-100 p-1.5"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </td>
                      <td className="h-14 px-4 align-middle">
                        <input
                          type="number"
                          aria-label="Estimated minutes"
                          min={1}
                          max={MAX_MINUTES}
                          value={editValues.estimatedMinutes}
                          onChange={(e) =>
                            setEditValues({ ...editValues, estimatedMinutes: e.target.value })
                          }
                          className="w-full rounded bg-gray-100 p-1.5"
                        />
                      </td>
                      <td className="h-14 px-4 align-middle">
                        <select
                          aria-label="Status"
                          value={editValues.status}
                          onChange={(e) =>
                            setEditValues({ ...editValues, status: e.target.value as TaskStatus })
                          }
                          className="w-full rounded bg-gray-100 p-1.5"
                        >
                          <option value="backlog">To do</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="h-14 px-4 text-right align-middle whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            onClick={() => void saveEdit(task)}
                            disabled={savingId === task.id}
                            aria-label="Save changes"
                            className="inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-success-ink transition hover:bg-success-tint disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null)
                              setRowError(null)
                            }}
                            aria-label="Cancel editing"
                            className="inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-muted transition hover:bg-gray-100 hover:text-gray-800"
                          >
                            <X className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                const tag = COMPLEXITY_TAG[task.complexity]
                const badge = STATUS_BADGE[task.status]
                const stripe = i % 2 ? 'bg-gray-50' : ''
                const expanded = expandedId === task.id
                return (
                  <Fragment key={task.id}>
                    <tr className={`${stripe} hover:bg-primary-tint`}>
                      <td className="h-14 px-4 align-middle">
                        <div className="flex items-center gap-1.5">
                          {task.description && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId((cur) => (cur === task.id ? null : task.id))
                              }
                              aria-expanded={expanded}
                              aria-label={`${expanded ? 'Hide' : 'Show'} description for ${task.title}`}
                              className="shrink-0 cursor-pointer rounded p-0.5 text-muted transition hover:bg-gray-100 hover:text-gray-800"
                            >
                              <ChevronRight
                                className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                                aria-hidden
                              />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(task)}
                            aria-label={`Edit ${task.title}`}
                            className="block min-w-0 flex-1 cursor-pointer truncate text-left font-medium text-gray-800"
                          >
                            {task.title}
                          </button>
                        </div>
                      </td>
                      <td
                        onClick={() => startEdit(task)}
                        className="h-14 cursor-pointer px-4 align-middle"
                      >
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tag.className}`}
                        >
                          {tag.label}
                        </span>
                      </td>
                      <td
                        onClick={() => startEdit(task)}
                        className="h-14 cursor-pointer px-4 align-middle text-muted"
                      >
                        {task.estimatedMinutes}m
                      </td>
                      <td
                        onClick={() => startEdit(task)}
                        className="h-14 cursor-pointer px-4 align-middle"
                      >
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="h-14 px-4 text-right align-middle whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {task.status === 'backlog' && (
                            <button
                              onClick={() => void onStart(task)}
                              aria-label={`Start ${task.title}`}
                              className="inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-primary-ink transition hover:bg-primary-tint"
                            >
                              <Play
                                className="h-5 w-5"
                                fill="currentColor"
                                strokeWidth={0}
                                aria-hidden
                              />
                            </button>
                          )}
                          {task.status === 'in_progress' && (
                            <Link
                              to={`/play/progress/${task.id}`}
                              aria-label={`Resume ${task.title}`}
                              className="inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-primary-ink transition hover:bg-primary-tint"
                            >
                              <Play
                                className="h-5 w-5"
                                fill="currentColor"
                                strokeWidth={0}
                                aria-hidden
                              />
                            </Link>
                          )}
                          {/* Edit (#218): desktop opens a modal over the list (kept
                              in context); mobile (< sm) keeps the full-page route,
                              which also still backs deep links + refresh everywhere.
                              Only one is in the a11y tree per breakpoint (the other
                              is display:none). */}
                          <button
                            type="button"
                            onClick={() => setEditModalTask(task)}
                            aria-label={`Edit details for ${task.title}`}
                            className="hidden cursor-pointer items-center justify-center rounded-md p-1.5 text-muted transition hover:bg-gray-100 hover:text-gray-800 sm:inline-flex"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </button>
                          <Link
                            to={`/tasks/${task.id}/edit`}
                            aria-label={`Edit details for ${task.title}`}
                            className="inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-muted transition hover:bg-gray-100 hover:text-gray-800 sm:hidden"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </Link>
                          <button
                            onClick={() => onDelete(task)}
                            aria-label={`Delete ${task.title}`}
                            className="inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && task.description && (
                      <tr className={stripe}>
                        <td
                          colSpan={5}
                          className="px-4 pb-3 text-sm whitespace-pre-wrap text-gray-600"
                        >
                          {task.description}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Keyset "Load more" (#100) — only Done/All ever grow past one page. */}
      {!loading && nextCursor != null && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="cursor-pointer rounded-lg bg-surface px-5 py-2 text-sm font-semibold text-primary-ink transition hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {pendingTask && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          onMouseEnter={pauseUndo}
          onMouseLeave={resumeUndo}
          onFocus={pauseUndo}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) resumeUndo()
          }}
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white"
        >
          <span>
            Deleted “
            {pendingTask.title.length > 32
              ? pendingTask.title.slice(0, 32) + '…'
              : pendingTask.title}
            ”
          </span>
          <button onClick={undoDelete} className="font-semibold text-warning-ink hover:underline">
            Undo
          </button>
        </div>
      )}

      {editModalTask && (
        <EditTaskModal
          task={editModalTask}
          onClose={() => setEditModalTask(null)}
          onSaved={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)).sort(byIdDesc))
            setEditModalTask(null)
          }}
        />
      )}
    </main>
  )
}
