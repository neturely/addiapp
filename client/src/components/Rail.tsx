import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { projectPole } from '@/lib/projectColors'
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
  const [counts, setCounts] = useState<TaskCounts | null>(null)

  // Refresh on route change (InProgressProvider's pattern — no polling) AND on
  // the projects-changed signal: a modal create/archive doesn't navigate, so
  // without it the rail would go stale until the next navigation (#268).
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const bump = () => setRefresh((n) => n + 1)
    window.addEventListener(PROJECTS_CHANGED_EVENT, bump)
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, bump)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchProjects()
      .then((p) => !cancelled && setProjects(p))
      .catch(() => undefined) // the rail degrades to the fixed entries
    fetchTasksPage({ limit: 1 })
      .then((page) => !cancelled && page.counts && setCounts(page.counts))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search, refresh])

  const onDashboard = location.pathname === '/dashboard'
  const tab = searchParams.get('tab')
  const view = searchParams.get('view')
  const archived = searchParams.get('archived') === '1'
  const projectParam = Number(searchParams.get('project'))

  const isAll = onDashboard && !tab && view !== 'projects' && !projectParam
  const isUnassigned = onDashboard && tab === 'unassigned'
  const isDone = onDashboard && tab === 'done'
  const isArchived = onDashboard && view === 'projects' && archived
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
      <RailHead label="Tasks" plusTo="/tasks/new" plusLabel="Add task" plusState={{ from: '/dashboard' }} />
      <RailLink to="/dashboard" active={isAll} pole="bg-primary" label="All tasks" count={counts?.all} />
      <RailLink
        to="/dashboard?tab=unassigned"
        active={isUnassigned}
        pole="bg-gray-400"
        label="Unassigned"
        count={counts?.unassigned}
      />
      <RailLink
        to="/dashboard?tab=done"
        active={isDone}
        pole="bg-success"
        label="Completed"
        count={counts?.done}
      />

      <RailHead
        label="Projects"
        plusTo="/dashboard?view=projects&new=1"
        plusLabel="New project"
        className="mt-6"
      />
      {projects.map((p) => (
        <RailLink
          key={p.id}
          to={`/dashboard?project=${p.id}`}
          active={activeProjectId === p.id}
          pole={projectPole(p.color)}
          label={p.name}
          count={p.remainingCount}
        />
      ))}
      <RailLink
        to="/dashboard?view=projects&archived=1"
        active={isArchived}
        pole="bg-gray-400"
        label="Archived"
      />
    </nav>
  )
}

function RailHead({
  label,
  plusTo,
  plusLabel,
  plusState,
  className = '',
}: {
  label: string
  plusTo: string
  plusLabel: string
  plusState?: unknown
  className?: string
}) {
  return (
    <div className={`mb-1 flex items-center justify-between pl-2.5 pr-1 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
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
