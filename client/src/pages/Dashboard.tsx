import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Play,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react'
import {
  archiveTask,
  assignTaskToProject,
  deleteTask,
  fetchTasksPage,
  startTask,
  type Task,
  type TaskComplexity,
  type TaskCounts,
  type TaskStatus,
} from '@/lib/tasks'
import { fetchPoints } from '@/lib/points'
import { elapsedSecondsSince, formatClock } from '@/lib/time'
import { projectPole, projectTint } from '@/lib/projectColors'
import { fetchProjects, type Project } from '@/lib/projects'
import { deleteCategory, fetchCategories, type Category } from '@/lib/categories'
import { Button } from '@/components/Button'
import { CategoryModal } from '@/components/CategoryModal'
import { Mascot } from '@/components/Mascot'
import { Modal } from '@/components/Modal'
import { ProjectsView } from '@/components/ProjectsView'
import { useShell } from '@/shell/useShell'
import { useToast } from '@/toast/useToast'

type Filter = 'all' | TaskStatus | 'unassigned' | 'archived' | 'recurring'
type View = 'tasks' | 'projects'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'backlog', label: 'Ready' }, // presentation label; enum value stays `backlog` (#178)
  { key: 'in_progress', label: 'Started' },
  { key: 'done', label: 'Done' },
  { key: 'archived', label: 'Archived' }, // the #312 archive axis, not a status
  { key: 'recurring', label: 'Recurring' }, // live recurring chains (2.3.0 review round)
]

// Tint pills (#178 palette): dark on-fill text keeps them AA in a dense list.
const COMPLEXITY_TAG: Record<TaskComplexity, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-[#bfe9cd] text-on-success' },
  medium: { label: 'Medium', className: 'bg-[#ffe3a0] text-on-warning' },
  high: { label: 'High', className: 'bg-[#ffcdb8] text-on-primary' },
}

// Status pill for mixed-status lists (#322): the #256 display labels (never a
// new string source) on the AA tint+ink pairs. Only Ready/Started/Done —
// Unassigned is a project axis, already visible in the project cell.
const STATUS_TAG: Record<TaskStatus, { label: string; className: string }> = {
  backlog: { label: 'Ready', className: 'bg-accent-tint text-accent-ink' },
  in_progress: { label: 'Started', className: 'bg-warning-tint text-warning-ink' },
  done: { label: 'Done', className: 'bg-success-tint text-success-ink' },
}
// The archived axis outranks the underlying 'done' in the pill (#330) — a
// filed task must read "Archived", never "Done".
const ARCHIVED_TAG = { label: 'Archived', className: 'bg-field text-muted' }

const PAGE_SIZE = 25 // offset page size (#262)

/** Future-dated ("snoozed", #250)? Compares Y-m-d strings in local time. */
function isSnoozed(availableFrom: string | null | undefined): boolean {
  if (!availableFrom) return false
  return availableFrom > new Date().toLocaleDateString('sv-SE')
}

/** '2026-08-25' → 'Aug 25' for the snooze chip (#250). */
function shortDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

// Map the `?tab=` URL param (#236 ride-along, #260 rail links) to a filter.
function filterFromTab(tab: string | null): Filter {
  return tab === 'unassigned' ||
    tab === 'backlog' ||
    tab === 'in_progress' ||
    tab === 'done' ||
    tab === 'archived' ||
    tab === 'recurring'
    ? tab
    : 'all'
}

/**
 * Dashboard (#262, superseding the #36/#178 table) — the admin surface as a
 * single-line row list: pole + project · effort pill · title — description ·
 * estimate · points. A row opens the task in place (`/tasks/:id`, the ONE edit
 * path — inline edit and the #218 modal are gone). Offset prev/next pagination
 * with an exact "X–Y of Z" range (supersedes #100's keyset cursor) and a
 * "ready to do" figure off the server counts. The Unassigned tab keeps the #236
 * assign flow as a trailing row action.
 */
export function Dashboard() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { search } = useShell()

  // Tasks vs Projects view, URL-driven (`?view=`) — navigated from the rail's
  // linkable section headings (the in-page toggle was removed on #256 review).
  const [searchParams, setSearchParams] = useSearchParams()
  const view: View = searchParams.get('view') === 'projects' ? 'projects' : 'tasks'

  // `?project=ID`: with `tab=unassigned` it's the #236 assign ride-along target;
  // without it's the #260 rail per-project filter (every status).
  const tabParam = searchParams.get('tab')
  const projectParam = Number(searchParams.get('project'))
  const rideAlongId = Number.isInteger(projectParam) && projectParam > 0 ? projectParam : null
  const projectFilterId = tabParam !== 'unassigned' && view === 'tasks' ? rideAlongId : null

  // `?category=ID` (#276): the rail's custom-list entries. Independent axis;
  // the project filter wins if both ever appear in one URL.
  const categoryParam = Number(searchParams.get('category'))
  const categoryFilterId =
    view === 'tasks' &&
    tabParam !== 'unassigned' &&
    projectFilterId === null &&
    Number.isInteger(categoryParam) &&
    categoryParam > 0
      ? categoryParam
      : null

  const [tasks, setTasks] = useState<Task[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<TaskCounts | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [basePoints, setBasePoints] = useState<Record<TaskComplexity, number> | null>(null)

  // The filter is purely URL-derived (#256 review): the rail's Tasks entries set
  // `?tab=` — there is no in-page filter UI any more.
  const filter = filterFromTab(tabParam)
  // Sort toggle (#256 review): NEWEST FIRST is the default; `?sort=oldest`
  // flips it. URL-driven so the choice is shareable and survives refresh.
  const newestFirst = searchParams.get('sort') !== 'oldest'
  function toggleSort() {
    const params = new URLSearchParams(searchParams)
    if (newestFirst) params.set('sort', 'oldest')
    else params.delete('sort')
    setSearchParams(params)
  }

  // A filter or sort change is a fresh first page.
  useEffect(() => setOffset(0), [filter, projectFilterId, categoryFilterId, newestFirst])

  const loadPage = useCallback(() => {
    const order = newestFirst ? ('desc' as const) : undefined
    const query =
      projectFilterId !== null
        ? { projectId: projectFilterId, limit: PAGE_SIZE, offset, order }
        : categoryFilterId !== null
          ? { categoryId: categoryFilterId, limit: PAGE_SIZE, offset, order }
          : filter === 'unassigned'
            ? { unassigned: true, limit: PAGE_SIZE, offset, order }
            : filter === 'archived'
              ? { archived: true, limit: PAGE_SIZE, offset, order }
              : filter === 'recurring'
                ? { recurring: true, limit: PAGE_SIZE, offset, order }
                : { status: filter === 'all' ? undefined : filter, limit: PAGE_SIZE, offset, order }
    return fetchTasksPage(query)
  }, [filter, projectFilterId, categoryFilterId, offset, newestFirst])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadPage()
      .then((page) => {
        if (cancelled) return
        setTasks(page.tasks)
        setTotal(page.total)
        setCounts(page.counts)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load tasks'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [loadPage])

  useEffect(() => {
    fetchPoints()
      .then((p) => setBasePoints(p.basePoints))
      .catch(() => undefined) // rows degrade to no points column
  }, [])

  // Projects ('all', #310): the Unassigned tab's assign picker lists every
  // status (assigning to done/archived reactivates server-side), ride-along
  // resolution (#236), and the project-filter banner's name/pole (#260).
  const [projects, setProjects] = useState<Project[]>([])
  useEffect(() => {
    if (filter !== 'unassigned' && projectFilterId === null) return
    let cancelled = false
    fetchProjects('all')
      .then((p) => !cancelled && setProjects(p))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [filter, projectFilterId])

  // Categories (#276; management moved into the rail, #336): the active
  // filter's name/colour for the toolbar, the `?newCategory=1` modal deep-link
  // from the rail's plus, and `?editCategory=1` — the rail edit affordance's
  // deep link, which rides ON a `?category=ID` filter (you land on the list
  // you're managing; closing the modal leaves you there).
  const [categories, setCategories] = useState<Category[]>([])
  const newCategoryParam = searchParams.get('newCategory') === '1'
  const editCategoryParam = searchParams.get('editCategory') === '1'
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
  const [categoryBusy, setCategoryBusy] = useState(false)
  useEffect(() => {
    if (categoryFilterId === null) return
    let cancelled = false
    fetchCategories()
      .then((c) => !cancelled && setCategories(c))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [categoryFilterId])
  const filterCategory =
    categoryFilterId !== null ? (categories.find((c) => c.id === categoryFilterId) ?? null) : null

  function closeNewCategory() {
    const params = new URLSearchParams(searchParams)
    params.delete('newCategory')
    setSearchParams(params)
  }

  function closeEditCategory() {
    const params = new URLSearchParams(searchParams)
    params.delete('editCategory')
    setSearchParams(params)
  }

  async function confirmDeleteCategory() {
    if (!deletingCategory) return
    setCategoryBusy(true)
    try {
      const { unlabelledTasks } = await deleteCategory(deletingCategory.id)
      showToast({
        message:
          unlabelledTasks > 0
            ? `Category deleted — ${unlabelledTasks} ${unlabelledTasks === 1 ? 'task' : 'tasks'} kept without it`
            : 'Category deleted',
        icon: X,
        tone: 'neutral',
      })
      setDeletingCategory(null)
      navigate('/dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the category.')
      setDeletingCategory(null)
    } finally {
      setCategoryBusy(false)
    }
  }

  const rideAlongProject =
    rideAlongId !== null ? (projects.find((p) => p.id === rideAlongId) ?? null) : null

  function clearRideAlong() {
    const params = new URLSearchParams(searchParams)
    params.delete('project')
    setSearchParams(params)
  }

  // Assign a task (Unassigned tab, #236). The server is authoritative — refetch
  // the current page after success (offset pagination makes splicing fragile).
  async function assign(task: Task, project: Project) {
    try {
      await assignTaskToProject(task.id, project.id)
      showToast({ message: `Assigned to ${project.name}`, icon: FolderPlus, tone: 'success' })
      const page = await loadPage()
      setTasks(page.tasks)
      setTotal(page.total)
      setCounts(page.counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign that task.')
    }
  }

  // One-click archive from the Done tab (#321) — the standard done → archived
  // path, refetching like assign so the row leaves and counts settle.
  async function archiveDone(task: Task) {
    try {
      await archiveTask(task.id, true)
      showToast({ message: 'Task archived', icon: Archive, tone: 'neutral' })
      const page = await loadPage()
      setTasks(page.tasks)
      setTotal(page.total)
      setCounts(page.counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not archive that task.')
    }
  }

  // Delete from the archive tab (#330 — replaced Unarchive: un-filing is the
  // task view's job via its Status select). Confirmed via modal, then a
  // server-authoritative refetch.
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
  const [taskBusy, setTaskBusy] = useState(false)
  async function confirmDeleteTask() {
    if (!deletingTask) return
    setTaskBusy(true)
    try {
      await deleteTask(deletingTask.id)
      showToast({ message: `Task deleted: ${deletingTask.title}`, icon: Trash2, tone: 'neutral' })
      setDeletingTask(null)
      const page = await loadPage()
      setTasks(page.tasks)
      setTotal(page.total)
      setCounts(page.counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that task.')
      setDeletingTask(null)
    } finally {
      setTaskBusy(false)
    }
  }

  // One-click play from a ready row (#256 review).
  async function playNow(task: Task) {
    try {
      const started = await startTask(task.id)
      navigate(`/play/progress/${started.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the task.')
    }
  }

  // Header search (#260): a view-local narrowing of the loaded page.
  const q = search.trim().toLowerCase()
  const visible = tasks.filter(
    (t) =>
      q === '' ||
      t.title.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q),
  )

  const first = total === 0 ? 0 : offset + 1
  const last = Math.min(offset + PAGE_SIZE, total)
  const canPrev = offset > 0
  const canNext = last < total

  // Arrows render only when there is somewhere to go (#256 review — no greyed
  // stubs); the whole pager vanishes on a single page.
  function Pager() {
    if (!canPrev && !canNext) return null
    return (
      <div className="flex items-center gap-0.5">
        {canPrev && (
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            aria-label="Previous page"
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-gray-700 transition hover:bg-field-hover sm:h-8 sm:w-8"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        )}
        {canNext && (
          <button
            type="button"
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            aria-label="Next page"
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-gray-700 transition hover:bg-field-hover sm:h-8 sm:w-8"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    )
  }

  const rangeLabel = `${first}–${last} of ${total}`
  // Toolbar's selection label — mirrors the rail choice (project name, a status
  // filter, or "All tasks").
  const filterProject =
    projectFilterId !== null ? projects.find((p) => p.id === projectFilterId) : undefined
  const selectionLabel =
    projectFilterId !== null
      ? (filterProject?.name ?? 'Project')
      : categoryFilterId !== null
        ? (filterCategory?.name ?? 'Category')
        : filter === 'all'
          ? 'All tasks'
          : filter === 'unassigned'
            ? 'Unassigned'
            : (FILTERS.find((f) => f.key === filter)?.label ?? 'All tasks')
  // Count text scopes to the selection (#256 review; per-tab figures #363): a
  // project/category filter shows THAT list's remaining count (the rail's
  // figure); a status tab shows its own count + wording. "All tasks" keeps the
  // actionable backlog figure — it mirrors the rail's Ready badge.
  const statusCount: Record<Filter, { count: number; noun: string }> = {
    all: { count: counts?.backlog ?? 0, noun: 'ready to do' },
    backlog: { count: counts?.backlog ?? 0, noun: 'ready to do' },
    in_progress: { count: counts?.in_progress ?? 0, noun: 'started' },
    done: { count: counts?.done ?? 0, noun: 'done' },
    unassigned: { count: counts?.unassigned ?? 0, noun: 'unassigned' },
    archived: { count: counts?.archived ?? 0, noun: 'archived' },
    recurring: { count: counts?.recurring ?? 0, noun: 'recurring' },
  }
  const { count: tabCount, noun: tabNoun } = statusCount[filter]
  const countLabel = filterProject
    ? `${filterProject.remainingCount} of ${filterProject.totalCount} left to do`
    : filterCategory
      ? `${filterCategory.remainingCount} of ${filterCategory.totalCount} left to do`
      : `${tabCount} ${tabCount === 1 ? 'task' : 'tasks'} ${tabNoun}`

  return (
    // No page heading / view toggle (review feedback on #256): the rail's
    // linkable Tasks/Projects section headings are the view navigation now;
    // an sr-only h1 keeps the page named for screen readers.
    <main className="flex min-h-screen w-full flex-col p-4 sm:p-6">
      <h1 className="sr-only">Dashboard</h1>

      {view === 'projects' ? (
        <ProjectsView />
      ) : (
        <>
          {/* (The old project-filter banner is gone, #256 review — the toolbar's
              selection label + scoped count carry the same information, and the
              rail's All tasks is the way back.) */}

          {/* Ride-along assign banner (#236). */}
          {filter === 'unassigned' && rideAlongProject && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-accent-tint px-4 py-2.5 text-sm">
              <span className="text-accent-ink">
                Assigning to <span className="font-semibold">{rideAlongProject.name}</span> — tap{' '}
                <span className="font-semibold">Assign</span> on a task below.
              </span>
              <button
                type="button"
                onClick={clearRideAlong}
                className="shrink-0 cursor-pointer rounded-md p-1 text-accent-ink transition hover:bg-white/50"
                aria-label="Stop assigning to this project"
              >
                <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          )}
          {filter === 'unassigned' &&
            rideAlongId !== null &&
            !rideAlongProject &&
            projects.length > 0 && (
              <p role="status" className="mb-4 text-sm text-muted">
                That project isn’t available — pick one from each task’s Assign button.
              </p>
            )}

          {/* Toolbar (#262; #256 review layout): "{selection} · sort toggle" —
              dynamic from the rail — then the count (project-scoped when a
              project filter is active); range + pager right. */}
          <div className="mb-2.5 flex items-center gap-2.5 px-1 text-xs text-muted">
            <span className="flex items-center gap-1">
              {selectionLabel} ·{' '}
              <button
                type="button"
                onClick={toggleSort}
                aria-label={`Sorted ${newestFirst ? 'newest' : 'oldest'} first — switch to ${newestFirst ? 'oldest' : 'newest'} first`}
                className="cursor-pointer transition hover:text-primary-ink"
              >
                {newestFirst ? 'newest first' : 'oldest first'}
              </button>
            </span>
            <span className="h-[3px] w-[3px] flex-none rounded-full bg-gray-300" aria-hidden />
            <span className="font-medium text-gray-700 tabular-nums">{countLabel}</span>
            {/* (The toolbar's category Edit/Delete is gone, #336 — management
                lives on the rail entry's edit affordance → the modal.) */}
            <span className="flex-1" aria-hidden />
            <span className="tabular-nums">{rangeLabel}</span>
            <Pager />
          </div>

          {error && (
            <p role="alert" className="mb-3 text-sm text-danger-ink">
              {error}
            </p>
          )}

          {loading ? (
            <p role="status" className="p-8 text-center text-muted">
              Loading…
            </p>
          ) : visible.length === 0 ? (
            <div className="rounded-xl bg-surface p-10 text-center">
              {/* "Nothing to see here" mascot (#256 review) — the shared empty
                  treatment for any information-less view. */}
              <Mascot expression="empty" className="mx-auto mb-4 h-20 w-20" />
              <p className="text-muted">
                {q !== ''
                  ? 'Nothing matches your search.'
                  : projectFilterId !== null
                    ? 'No tasks in this project yet.'
                    : categoryFilterId !== null
                      ? 'No tasks in this category yet.'
                      : filter === 'archived'
                        ? 'Nothing archived — archive done tasks to file them away.'
                        : filter === 'recurring'
                          ? 'No recurring tasks — set a Repeat on a task to see it here.'
                          : (counts?.all ?? 0) === 0
                          ? 'No tasks yet.'
                          : filter === 'unassigned'
                            ? 'No unassigned tasks — every task is in a project.'
                            : `No ${(FILTERS.find((f) => f.key === filter)?.label ?? '').toLowerCase()} tasks.`}
              </p>
              <Link
                to="/tasks/new"
                state={{ from: '/dashboard' }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-deep px-4 py-2 font-semibold text-white transition hover:bg-primary-deep-hover"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
                Add a task
              </Link>
            </div>
          ) : (
            <>
              <ul aria-label="Tasks" className="flex flex-col gap-px">
                {visible.map((task, i) => (
                  <li
                    key={task.id}
                    // Hover is a barely-off-white (#256 review) — distinct from
                    // the cream page behind the table, softer than the old tint.
                    className={`group flex h-12 items-center bg-surface transition hover:bg-[#fbf8f3] ${
                      i === 0 ? 'rounded-t-xl' : ''
                    } ${i === visible.length - 1 ? 'rounded-b-xl' : ''}`}
                  >
                    {/* Leading pole cell — on ready rows at sm+, hovering the
                        row swaps the colour indicator for the play button
                        (#256 review; below sm the trailing button serves). */}
                    <span className="relative ml-5 flex h-full w-2 flex-none items-center">
                      {task.status === 'backlog' && (
                        <button
                          type="button"
                          onClick={() => void playNow(task)}
                          aria-label={`Start ${task.title}`}
                          className="peer absolute left-1/2 top-1/2 hidden h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-success-ink opacity-0 transition hover:bg-success-tint focus-visible:opacity-100 group-hover:opacity-100 sm:inline-flex"
                        >
                          <Play
                            className="h-4 w-4"
                            fill="currentColor"
                            strokeWidth={0}
                            aria-hidden
                          />
                        </button>
                      )}
                      <span
                        className={`pointer-events-none h-2 w-2 rounded-[3px] ${
                          task.project ? projectPole(task.project.color) : 'bg-gray-300'
                        } ${task.status === 'backlog' ? 'sm:peer-focus-visible:opacity-0 sm:group-hover:opacity-0' : ''}`}
                        aria-hidden
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      aria-label={`Open ${task.title}`}
                      className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-3.5 pl-3.5 pr-5 text-left"
                    >
                      <span
                        className={`hidden w-32 flex-none truncate text-[13px] sm:block ${
                          task.project ? 'font-medium text-gray-700' : 'text-muted'
                        }`}
                      >
                        {task.project?.name ?? 'No project'}
                      </span>
                      {/* Mixed-status lists — All tasks and the per-project/
                          category filters (both compute filter 'all') — spend
                          the pill slot on STATUS (#322): that's what the user
                          scans a mixed list for. The archived tab uses it too,
                          resolving the archived axis first (#330 — a filed
                          task reads "Archived", never "Done"). Homogeneous
                          status tabs (and Unassigned) keep the difficulty pill. */}
                      {(() => {
                        const tag =
                          filter === 'all' || filter === 'archived' || filter === 'recurring'
                            ? task.archivedAt
                              ? ARCHIVED_TAG
                              : STATUS_TAG[task.status]
                            : COMPLEXITY_TAG[task.complexity]
                        return (
                          <span
                            className={`flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tag.className}`}
                          >
                            {tag.label}
                          </span>
                        )
                      })()}
                      {/* "Title ↻ Description" (user feedback 2026-08-06): no
                          separator — the bold title carries the split; a
                          recurring rule puts the ↻ inline between the two. */}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span
                          className={
                            task.status === 'done'
                              ? 'font-semibold text-muted line-through'
                              : 'font-semibold text-gray-800'
                          }
                        >
                          {task.title}
                        </span>
                        {task.recurrence && (
                          <Repeat
                            role="img"
                            aria-label="Repeats"
                            className="mx-1.5 inline h-3.5 w-3.5 align-[-2px] text-muted"
                            strokeWidth={2.25}
                          />
                        )}
                        {task.description && (
                          <span className="text-muted">
                            {!task.recurrence && ' '}
                            {task.description}
                          </span>
                        )}
                      </span>
                      {/* Snooze chip (#250): future-dated rows stay visible but
                          distinct (hiding them repeats the #248 mistake). */}
                      {isSnoozed(task.availableFrom) && task.status === 'backlog' && (
                        <span className="hidden flex-none rounded-full bg-field px-2.5 py-0.5 text-[11px] font-medium text-muted sm:inline">
                          from {shortDate(task.availableFrom!)}
                        </span>
                      )}
                      {/* Category chip (#276; recoloured #336) — the label in
                          the category's own palette tint (dark neutral text is
                          AA on every slot's 18% tint), replacing the grey
                          pill + dot; hidden below sm where the row is tight,
                          and on the category's OWN filter view (redundant —
                          every row there shares it). */}
                      {task.category && categoryFilterId === null && (
                        <span
                          className="hidden max-w-28 flex-none truncate rounded-full px-2.5 py-0.5 text-[11px] font-medium text-gray-700 sm:inline-block"
                          style={{ backgroundColor: projectTint(task.category.color) }}
                        >
                          {task.category.name}
                        </span>
                      )}
                      {/* Started rows carry their own live clock (#256 review
                          — tasks run in parallel, each on its own timer). */}
                      {task.status === 'in_progress' && <RowTimer startedAt={task.startedAt} />}
                      {/* Estimate + points as ONE cell — "10 min / 5 pts"
                          (#256 review): same weight/size as the minutes, the
                          points half in gold (warning ink — the AA gold for
                          small text). Done rows show the points actually
                          EARNED; the rest show the base forecast. The minutes
                          half hides below sm. */}
                      <span className="w-14 flex-none text-right text-xs tabular-nums sm:w-32">
                        <span className="hidden text-muted sm:inline">
                          {task.estimatedMinutes} min /{' '}
                        </span>
                        {task.status === 'done' && task.earnedPoints != null ? (
                          <span className="text-warning-ink">+{task.earnedPoints} pts</span>
                        ) : basePoints ? (
                          <span className="text-warning-ink">
                            {basePoints[task.complexity]} pts
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {/* Below sm there's no hover for the pole swap, so ready
                        rows keep a trailing always-visible play button there. */}
                    {task.status === 'backlog' && (
                      <button
                        type="button"
                        onClick={() => void playNow(task)}
                        aria-label={`Start ${task.title}`}
                        className="mr-3 inline-flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-lg text-success-ink transition hover:bg-success-tint sm:hidden"
                      >
                        <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden />
                      </button>
                    )}
                    {filter === 'unassigned' && (
                      <AssignControl
                        task={task}
                        projects={projects}
                        target={rideAlongProject}
                        onAssign={(project) => void assign(task, project)}
                      />
                    )}
                    {/* One-click Archive on done rows (#321) — the Assign
                        button's trailing style/placement. */}
                    {filter === 'done' && task.status === 'done' && (
                      <button
                        type="button"
                        onClick={() => void archiveDone(task)}
                        aria-label={`Archive ${task.title}`}
                        className="mr-4 flex-none cursor-pointer rounded-lg bg-field px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-field-hover sm:py-1.5"
                      >
                        Archive
                      </button>
                    )}
                    {/* Delete (#330) — the archive tab's trailing row action
                        (un-filing lives in the task view's Status select). */}
                    {filter === 'archived' && (
                      <button
                        type="button"
                        onClick={() => setDeletingTask(task)}
                        aria-label={`Delete ${task.title}`}
                        className="mr-4 flex-none cursor-pointer rounded-lg bg-danger-tint px-3 py-2.5 text-xs font-semibold text-danger-ink transition hover:opacity-80 sm:py-1.5"
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-2.5 flex items-center justify-end gap-2.5 px-1 text-xs text-muted">
                <span className="tabular-nums">{rangeLabel}</span>
                <Pager />
              </div>
            </>
          )}
        </>
      )}

      {/* New category (#276) — the rail's Categories plus deep-links ?newCategory=1. */}
      {newCategoryParam && (
        <CategoryModal
          onClose={closeNewCategory}
          onSaved={(saved) => {
            closeNewCategory()
            navigate(`/dashboard?category=${saved.id}`)
          }}
        />
      )}
      {/* Edit category (#336) — deep-linked from the rail's inline edit
          affordance (?category=ID&editCategory=1). Delete lives inside it,
          handing off to the confirm dialog below. */}
      {editCategoryParam && filterCategory && (
        <CategoryModal
          category={filterCategory}
          onClose={closeEditCategory}
          onSaved={(saved) => {
            closeEditCategory()
            setCategories((cs) => cs.map((c) => (c.id === saved.id ? saved : c)))
          }}
          onDelete={() => {
            closeEditCategory()
            setDeletingCategory(filterCategory)
          }}
        />
      )}
      {/* Archived-row delete confirm (#330) — the TaskView dialog's copy. */}
      {deletingTask && (
        <Modal titleId="task-delete-title" onClose={() => !taskBusy && setDeletingTask(null)}>
          <h2 id="task-delete-title" className="mb-3 text-xl font-bold text-gray-800">
            Delete this task?
          </h2>
          <p className="mb-5 text-sm leading-relaxed text-gray-700">
            “{deletingTask.title}” will be permanently deleted. Points already earned from it are
            kept.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={taskBusy} onClick={() => setDeletingTask(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={taskBusy} onClick={() => void confirmDeleteTask()}>
              {taskBusy ? 'Deleting…' : 'Delete task'}
            </Button>
          </div>
        </Modal>
      )}
      {deletingCategory && (
        <Modal
          titleId="category-delete-title"
          onClose={() => !categoryBusy && setDeletingCategory(null)}
        >
          <h2 id="category-delete-title" className="mb-3 text-xl font-bold text-gray-800">
            Delete this category?
          </h2>
          <p className="mb-5 text-sm leading-relaxed text-gray-700">
            “{deletingCategory.name}” will be deleted. Its {deletingCategory.totalCount}{' '}
            {deletingCategory.totalCount === 1 ? 'task keeps' : 'tasks keep'} existing — they just
            lose the category.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={categoryBusy}
              onClick={() => setDeletingCategory(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={categoryBusy}
              onClick={() => void confirmDeleteCategory()}
            >
              {categoryBusy ? 'Deleting…' : 'Delete category'}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  )
}

/**
 * Live elapsed clock on a Started row (#256 review) — ticks client-side off the
 * server `startedAt`, the same anchor as the header chip and column mirror so
 * they always agree. Not a live region (no per-second SR spam); hidden below sm
 * where the row is already tight.
 */
function RowTimer({ startedAt }: { startedAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  return (
    <span className="hidden flex-none items-center gap-1.5 font-mono text-xs tabular-nums text-gray-700 sm:inline-flex">
      <span aria-hidden className="animate-pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      {formatClock(elapsedSecondsSince(startedAt, now))}
    </span>
  )
}

/**
 * Trailing row action on the Unassigned tab (#236): with a ride-along target,
 * one-click "Assign"; otherwise a small disclosure listing active projects.
 */
function AssignControl({
  task,
  projects,
  target,
  onAssign,
}: {
  task: Task
  projects: Project[]
  target: Project | null
  onAssign: (project: Project) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (target) {
    return (
      <button
        type="button"
        onClick={() => onAssign(target)}
        aria-label={`Assign ${task.title} to ${target.name}`}
        className="mr-4 flex-none cursor-pointer rounded-lg bg-accent-tint px-3 py-2.5 text-xs font-semibold text-accent-ink transition hover:opacity-80 sm:py-1.5"
      >
        Assign
      </button>
    )
  }

  return (
    <div ref={ref} className="relative mr-4 flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Assign ${task.title} to a project`}
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-field px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-field-hover sm:py-1.5"
      >
        Assign
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="absolute right-0 z-10 mt-1 max-h-64 w-52 overflow-y-auto rounded-lg bg-surface py-1 ring-1 ring-field-hover"
        >
          {projects.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">No projects yet.</p>
          ) : (
            // Grouped Active / Done / Archived (#310): a non-active pick is a
            // deliberate reactivation, so the groups are labelled (headings
            // only when a non-active group exists).
            (
              [
                ['Active', projects.filter((p) => p.status === 'active')],
                ['Done', projects.filter((p) => p.status === 'done')],
                ['Archived', projects.filter((p) => p.status === 'archived')],
              ] as const
            )
              .filter(([, group]) => group.length > 0)
              .map(([label, group], _i, groups) => (
                <div key={label}>
                  {groups.length > 1 && (
                    <p className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {label}
                    </p>
                  )}
                  {group.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onAssign(p)
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-page"
                    >
                      <span
                        className={`h-2 w-2 flex-none rounded-[3px] ${projectPole(p.color)}`}
                        aria-hidden
                      />
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  )
}
