import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, MoreVertical, Pencil, Plus } from 'lucide-react'
import { fetchProjects, updateProject, type Project } from '@/lib/projects'
import { useShell } from '@/shell/useShell'
import { useToast } from '@/toast/useToast'
import { ProjectModal } from './ProjectModal'

/**
 * Dashboard Projects view (#234): the grid of projects reached via the
 * Dashboard's Tasks | Projects toggle. Each active card shows the "X of Y
 * remaining" count, a kebab (Edit / Archive), and footer actions (Add task,
 * Assign task). New project opens the shared Modal (also via `?new=1`, the
 * rail's plus, #260).
 *
 * Archived mode (#248 → #260): `?archived=1` (the rail's Archived entry, plus
 * the toggle pill here) swaps the grid to archived projects — visually muted,
 * kebab replaced by a single Unarchive action (PATCH status:'active').
 */
export function ProjectsView() {
  const { showToast } = useToast()
  const { search } = useShell()
  const [searchParams, setSearchParams] = useSearchParams()
  const archived = searchParams.get('archived') === '1'

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // `undefined` = closed; `null` = new; a Project = editing that one.
  const [modal, setModal] = useState<Project | null | undefined>(
    searchParams.get('new') === '1' ? null : undefined,
  )
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchProjects(archived ? 'archived' : 'active')
      .then((p) => !cancelled && setProjects(p))
      .catch(
        (e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load projects'),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [archived])

  // The rail's "New project" plus deep-links with ?new=1 — honour it arriving
  // after mount too, then drop the param so refresh/back don't re-open the modal.
  const newParam = searchParams.get('new') === '1'
  useEffect(() => {
    if (!newParam) return
    setModal(null)
    const params = new URLSearchParams(searchParams)
    params.delete('new')
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam])

  // Close an open kebab menu on any outside click.
  useEffect(() => {
    if (openMenuId === null) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openMenuId])

  function setArchivedParam(next: boolean) {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('archived', '1')
    else params.delete('archived')
    setSearchParams(params)
  }

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

  async function onUnarchive(project: Project) {
    // Optimistic mirror of onArchive, from the archived grid (#248).
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    try {
      await updateProject(project.id, { status: 'active' })
      showToast({
        message: `Project restored: ${project.name}`,
        icon: ArchiveRestore,
        tone: 'success',
      })
    } catch (e) {
      setProjects((prev) => [project, ...prev].sort((a, b) => b.id - a.id))
      setError(e instanceof Error ? e.message : 'Could not restore that project.')
    }
  }

  const q = search.trim().toLowerCase()
  const visible = q === '' ? projects : projects.filter((p) => p.name.toLowerCase().includes(q))

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* Active | Archived pill toggle (#248) — URL-driven so it's linkable
            (the rail's Archived entry lands on ?view=projects&archived=1). */}
        <div className="flex gap-2">
          {(
            [
              [false, 'Active'],
              [true, 'Archived'],
            ] as [boolean, string][]
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={archived === v}
              onClick={() => setArchivedParam(v)}
              className={`cursor-pointer rounded-full px-3 py-1 text-sm font-medium transition ${
                archived === v ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-primary-tint'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {!archived && (
          <button
            type="button"
            onClick={() => setModal(null)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary-deep px-4 py-2 font-semibold text-white transition hover:bg-primary-deep-hover"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            New project
          </button>
        )}
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
      ) : archived && visible.length === 0 ? (
        <p className="rounded-2xl bg-surface p-10 text-center text-muted">
          {q !== '' ? 'Nothing matches your search.' : 'No archived projects.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((project) =>
            archived ? (
              <ArchivedProjectCard
                key={project.id}
                project={project}
                onUnarchive={() => void onUnarchive(project)}
              />
            ) : (
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
            ),
          )}

          {/* Dashed "New project" card — always the last grid cell, so the empty
              state is just this invitation. Active grid only. */}
          {!archived && (
            <button
              type="button"
              onClick={() => setModal(null)}
              className="flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 p-5 text-muted transition hover:border-primary hover:text-primary-ink"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
              <span className="font-semibold">New project</span>
            </button>
          )}
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

/** Archived card (#248): muted, read-only apart from Unarchive. */
function ArchivedProjectCard({
  project,
  onUnarchive,
}: {
  project: Project
  onUnarchive: () => void
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface p-5 opacity-80">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate font-bold text-gray-600">{project.name}</h3>
        <span className="rounded-full bg-field px-2.5 py-0.5 text-xs font-semibold text-muted">
          Archived
        </span>
      </div>
      {project.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted">{project.description}</p>
      )}
      <p className="mt-3 text-sm font-medium text-muted">
        {project.totalCount === 0
          ? 'No tasks'
          : `${project.remainingCount} of ${project.totalCount} remaining`}
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={onUnarchive}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-field px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-field-hover"
        >
          <ArchiveRestore className="h-4 w-4" aria-hidden />
          Unarchive
        </button>
      </div>
    </div>
  )
}
