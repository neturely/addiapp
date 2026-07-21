import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, MoreVertical, Pencil, Plus } from 'lucide-react'
import { fetchProjects, updateProject, type Project } from '@/lib/projects'
import { useToast } from '@/toast/useToast'
import { ProjectModal } from './ProjectModal'

/**
 * Dashboard Projects view (#234): the grid of active projects reached via the
 * Dashboard's Tasks | Projects toggle. Each card shows the "X of Y remaining"
 * count, a kebab (Edit / Archive), and footer actions (Add task, Assign task).
 * New project opens the shared Modal. Archive (the terminal state) drops the card
 * from the active grid. Self-contained — owns its own fetch + modal + menu state
 * so the Dashboard's Tasks view is untouched.
 */
export function ProjectsView() {
  const { showToast } = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // `undefined` = closed; `null` = new; a Project = editing that one.
  const [modal, setModal] = useState<Project | null | undefined>(undefined)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchProjects()
      .then((p) => !cancelled && setProjects(p))
      .catch(
        (e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load projects'),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Close an open kebab menu on any outside click.
  useEffect(() => {
    if (openMenuId === null) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openMenuId])

  function onSaved(saved: Project) {
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === saved.id)
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev]
    })
    setModal(undefined)
  }

  async function onArchive(project: Project) {
    setOpenMenuId(null)
    // Optimistic: drop from the active grid immediately; restore on failure.
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    try {
      await updateProject(project.id, { status: 'archived' })
      showToast({ message: `Project archived: ${project.name}`, icon: Archive, tone: 'neutral' })
    } catch (e) {
      setProjects((prev) => [project, ...prev].sort((a, b) => b.id - a.id))
      setError(e instanceof Error ? e.message : 'Could not archive that project.')
    }
  }

  return (
    <section>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setModal(null)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xl font-bold text-white transition hover:opacity-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          New project
        </button>
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              menuOpen={openMenuId === project.id}
              onToggleMenu={() => setOpenMenuId((cur) => (cur === project.id ? null : project.id))}
              onEdit={() => {
                setOpenMenuId(null)
                setModal(project)
              }}
              onArchive={() => void onArchive(project)}
            />
          ))}

          {/* Dashed "New project" card — always the last grid cell, so the empty
              state is just this invitation. */}
          <button
            type="button"
            onClick={() => setModal(null)}
            className="flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 p-5 text-muted transition hover:border-primary hover:text-primary-ink"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
            <span className="font-semibold">New project</span>
          </button>
        </div>
      )}

      {modal !== undefined && (
        <ProjectModal
          project={modal ?? undefined}
          onClose={() => setModal(undefined)}
          onSaved={onSaved}
        />
      )}
    </section>
  )
}

function ProjectCard({
  project,
  menuOpen,
  onToggleMenu,
  onEdit,
  onArchive,
}: {
  project: Project
  menuOpen: boolean
  onToggleMenu: () => void
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate font-bold text-gray-800">{project.name}</h3>
        <div
          className="relative shrink-0"
          // Keep clicks inside the menu from bubbling to the document close handler.
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Plain disclosure, not a role=menu widget: Tab reaches the two
              buttons and Escape closes — no roving-tabindex/arrow-key contract to
              honour (repo a11y rule). aria-expanded reflects open state. */}
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label={`Actions for ${project.name}`}
            aria-expanded={menuOpen}
            className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted transition hover:bg-gray-100 hover:text-gray-800"
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </button>
          {menuOpen && (
            <div
              onKeyDown={(e) => e.key === 'Escape' && onToggleMenu()}
              className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-lg bg-surface py-1 ring-1 ring-gray-200"
            >
              <button
                type="button"
                onClick={onEdit}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </button>
              <button
                type="button"
                onClick={onArchive}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <Archive className="h-4 w-4" aria-hidden />
                Archive
              </button>
            </div>
          )}
        </div>
      </div>

      {project.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted">{project.description}</p>
      )}

      <p className="mt-3 text-sm font-medium text-muted">
        {project.totalCount === 0
          ? 'No tasks yet'
          : `${project.remainingCount} of ${project.totalCount} remaining`}
      </p>

      <div className="mt-4 flex gap-2">
        <Link
          to={`/tasks/new?project=${project.id}`}
          state={{ from: '/dashboard?view=projects' }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-tint px-3 py-1.5 text-sm font-semibold text-primary-ink transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Add task
        </Link>
        {/* Assign existing tasks — deep-links into the Tasks view's Unassigned tab
            with this project as the ride-along target (#236). */}
        <Link
          to={`/dashboard?tab=unassigned&project=${project.id}`}
          className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
        >
          Assign task
        </Link>
      </div>
    </div>
  )
}
