import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { projectPole } from '@/lib/projectColors'
import { CATEGORIES_CHANGED_EVENT, fetchCategories, type Category } from '@/lib/categories'
import { fetchProjects, PROJECTS_CHANGED_EVENT, type Project } from '@/lib/projects'
import { fetchTasksPage, type TaskCounts } from '@/lib/tasks'

/**
 * Collapsible navigation rail (#260). Two sections with inline plus buttons:
 * Tasks (All / Unassigned / Completed — the Dashboard's server-side filters) and
 * Projects (each active project filters the Dashboard to its tasks — the client
 * half of #245 — plus the Archived grid entry, #248). Counts come from the same
 * server sources the Dashboard uses (`counts` on page 1, project remaining
 * counts) and refresh on route change like InProgressProvider — no polling.
 *
 * Project poles carry each project's palette colour (#268); the fixed entries
 * keep their fixed hues.
 */
export function Rail({ drawer = false }: { drawer?: boolean }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [counts, setCounts] = useState<TaskCounts | null>(null)

  // Refresh on route change (InProgressProvider's pattern — no polling) AND on
  // the projects/categories-changed signals: a modal create/archive doesn't
  // navigate, so without them the rail would go stale until the next
  // navigation (#268, #276).
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const bump = () => setRefresh((n) => n + 1)
    window.addEventListener(PROJECTS_CHANGED_EVENT, bump)
    window.addEventListener(CATEGORIES_CHANGED_EVENT, bump)
    return () => {
      window.removeEventListener(PROJECTS_CHANGED_EVENT, bump)
      window.removeEventListener(CATEGORIES_CHANGED_EVENT, bump)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // 'all' (#256 review): the Projects section lists the Active/Archived pools
    // with counts, so both are needed; entries render the active ones.
    fetchProjects('all')
      .then((p) => !cancelled && setProjects(p))
      .catch(() => undefined) // the rail degrades to the fixed entries
    fetchCategories()
      .then((c) => !cancelled && setCategories(c))
      .catch(() => undefined)
    fetchTasksPage({ limit: 1 })
      .then((page) => !cancelled && page.counts && setCounts(page.counts))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search, refresh])

  // Done projects (#310) are hidden from the default entries, like archived —
  // they surface through their own pool link below.
  const activeProjects = projects.filter((p) => p.status === 'active')
  const doneCount = projects.filter((p) => p.status === 'done').length
  const archivedCount = projects.filter((p) => p.status === 'archived').length

  const onDashboard = location.pathname === '/dashboard'
  const tab = searchParams.get('tab')
  const view = searchParams.get('view')
  const archived = searchParams.get('archived') === '1'
  const statusParam = searchParams.get('status')
  const projectParam = Number(searchParams.get('project'))
  const categoryParam = Number(searchParams.get('category'))

  const isAll = onDashboard && !tab && view !== 'projects' && !projectParam && !categoryParam
  const isTab = (t: string) => onDashboard && tab === t
  const activeCategoryId =
    onDashboard && view !== 'projects' && categoryParam > 0 ? categoryParam : null
  const isArchived = onDashboard && view === 'projects' && archived
  const isDone = onDashboard && view === 'projects' && !archived && statusParam === 'done'
  const activeProjectId =
    onDashboard && view !== 'projects' && tab !== 'unassigned' && projectParam > 0
      ? projectParam
      : null

  return (
    <nav
      id="app-rail"
      aria-label="Sidebar"
      // Static pane at sm+; inside the #270 mobile drawer it fills the panel
      // (the drawer wrapper owns positioning/scrim).
      className={
        drawer
          ? 'flex h-full w-full flex-col overflow-y-auto px-2.5 py-4'
          : 'hidden w-56 flex-none flex-col overflow-y-auto px-2.5 py-4 sm:flex'
      }
    >
      <RailHead
        label="Tasks"
        to="/dashboard"
        plusTo="/tasks/new"
        plusLabel="Add task"
        plusState={{ from: '/dashboard' }}
      />
      {/* The full status-filter set lives HERE (#256 review — the in-table pill
          row is gone). Display labels only ("Ready" = `backlog`, "Started" =
          `in_progress`, #178 rule): never string-match a label. */}
      <RailLink to="/dashboard" active={isAll} pole="bg-primary" label="All tasks" count={counts?.all} />
      <RailLink
        to="/dashboard?tab=backlog"
        active={isTab('backlog')}
        pole="bg-accent"
        label="Ready"
        count={counts?.backlog}
      />
      <RailLink
        to="/dashboard?tab=in_progress"
        active={isTab('in_progress')}
        pole="bg-warning"
        label="Started"
        count={counts?.in_progress}
      />
      <RailLink
        to="/dashboard?tab=unassigned"
        active={isTab('unassigned')}
        pole="bg-gray-400"
        label="Unassigned"
        count={counts?.unassigned}
      />
      <RailLink
        to="/dashboard?tab=done"
        active={isTab('done')}
        pole="bg-success"
        label="Done"
        count={counts?.done}
      />

      {/* User-defined categories (#276): custom lists managed like projects —
          the plus opens the New-category modal on the Dashboard; each entry
          filters the task list to that category. */}
      <RailHead
        label="Categories"
        to="/dashboard"
        plusTo="/dashboard?newCategory=1"
        plusLabel="New category"
        className="mt-6"
      />
      {categories.map((c) => (
        <RailLink
          key={c.id}
          to={`/dashboard?category=${c.id}`}
          active={activeCategoryId === c.id}
          pole={projectPole(c.color)}
          label={c.name}
          count={c.remainingCount}
        />
      ))}
      {categories.length === 0 && (
        <p className="px-2.5 py-1 text-xs text-muted">Your own task lists — add one with +</p>
      )}

      <RailHead
        label="Projects"
        to="/dashboard?view=projects"
        plusTo="/dashboard?view=projects&new=1"
        plusLabel="New project"
        className="mt-6"
      />
      {/* The two pools (#256 review — the in-page Active|Archived pills are
          gone): both open the Projects grid; entries below are the active ones. */}
      <RailLink
        to="/dashboard?view=projects"
        active={onDashboard && view === 'projects' && !archived && !isDone}
        pole="bg-success"
        label="Active"
        count={activeProjects.length}
      />
      {activeProjects.map((p) => (
        <RailLink
          key={p.id}
          to={`/dashboard?project=${p.id}`}
          active={activeProjectId === p.id}
          pole={projectPole(p.color)}
          label={p.name}
          count={p.remainingCount}
        />
      ))}
      {/* The Done pool (#310) sits above Archived: auto-completed projects,
          hidden from the entries above like archived ones. */}
      <RailLink
        to="/dashboard?view=projects&status=done"
        active={isDone}
        pole="bg-success-tint"
        label="Done"
        count={doneCount}
      />
      {/* Archived always sits at the bottom of the section (#256 review). */}
      <RailLink
        to="/dashboard?view=projects&archived=1"
        active={isArchived}
        pole="bg-gray-400"
        label="Archived"
        count={archivedCount}
      />
    </nav>
  )
}

function RailHead({
  label,
  to,
  plusTo,
  plusLabel,
  plusState,
  className = '',
}: {
  label: string
  /** The section heading is itself a link (#256 review feedback) — Tasks →
   * the task list, Projects → the projects grid. */
  to: string
  plusTo: string
  plusLabel: string
  plusState?: unknown
  className?: string
}) {
  return (
    <div className={`mb-1 flex items-center justify-between pl-2.5 pr-1 ${className}`}>
      <Link
        to={to}
        // h-11 below sm = a real touch target in the drawer (#270); text-size at sm+.
        className="flex h-11 items-center text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:text-primary-ink sm:h-auto"
      >
        {label}
      </Link>
      <Link
        to={plusTo}
        state={plusState}
        aria-label={plusLabel}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted transition hover:bg-field-hover hover:text-primary-ink sm:h-6 sm:w-6"
      >
        <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} aria-hidden />
      </Link>
    </div>
  )
}

function RailLink({
  to,
  active,
  pole,
  label,
  count,
}: {
  to: string
  active: boolean
  pole: string
  label: string
  count?: number
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'true' : undefined}
      // h-11 below sm = the drawer's ≥44px touch target (#270); compact at sm+.
      className={`flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm sm:h-8 ${
        active
          ? 'bg-primary-tint font-semibold text-primary-ink'
          : 'text-gray-700 hover:bg-field-hover'
      }`}
    >
      <span className={`h-2 w-2 flex-none rounded-[3px] ${pole}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && (
        <span className={`text-xs tabular-nums ${active ? 'text-primary-ink' : 'text-muted'}`}>
          {count}
        </span>
      )}
    </Link>
  )
}
