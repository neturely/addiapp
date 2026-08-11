import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { projectPole } from '@/lib/projectColors'
import { deleteProject, fetchProjects, updateProject, type Project } from '@/lib/projects'
import { useShell } from '@/shell/useShell'
import { useToast } from '@/toast/useToast'
import { Button } from './Button'
import { Modal } from './Modal'
import { ProjectModal } from './ProjectModal'

const DELETE_TITLE_ID = 'project-delete-title'

/**
 * Dashboard Projects view (#234): the grid of projects reached via the
 * Dashboard's Tasks | Projects toggle. Each active card shows the "X of Y
 * remaining" count, a kebab (Edit / Archive), and footer actions (Add task,
 * Assign task). New project opens the shared Modal (also via `?new=1`, the
 * rail's plus, #260).
 *
 * Done mode (#310): `?status=done` — the auto-completed pool (every task done),
 * same cards as active (Edit/Archive still apply; adding a task reverts the
 * project to active server-side) with a "Done" chip.
 *
 * Archived mode (#248 → #260): `?archived=1` (the rail's Archived entry, plus
 * the toggle pill here) swaps the grid to archived projects — visually muted,
 * kebab replaced by Unarchive plus the #310 danger Delete (permanent; confirm
 * dialog states that tasks are kept and move to Unassigned).
 */
export function ProjectsView() {
  const { showToast } = useToast()
  const { search } = useShell()
  const [searchParams, setSearchParams] = useSearchParams()
  const archived = searchParams.get('archived') === '1'
  const done = !archived && searchParams.get('status') === 'done'

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // `undefined` = closed; `null` = new; a Project = editing that one.
  const [modal, setModal] = useState<Project | null | undefined>(
    searchParams.get('new') === '1' ? null : undefined,
  )
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  // #310: the archived card's Delete arms this; the Modal confirms it.
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchProjects(archived ? 'archived' : done ? 'done' : 'active')
      .then((p) => !cancelled && setProjects(p))
      .catch(
        (e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load projects'),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [archived, done])

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

  // #310: permanent delete, archived grid only. Tasks are never deleted — the
  // FK unassigns them; the server reports how many for the toast.
  async function onDeleteConfirmed(project: Project) {
    setDeleting(true)
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    try {
      const { unassignedTasks } = await deleteProject(project.id)
      showToast({
        message:
          unassignedTasks > 0
            ? `Project deleted — ${unassignedTasks} ${unassignedTasks === 1 ? 'task' : 'tasks'} moved to Unassigned`
            : 'Project deleted',
        icon: CircleCheck,
        tone: 'success',
      })
    } catch (e) {
      setProjects((prev) => [project, ...prev].sort((a, b) => b.id - a.id))
      setError(e instanceof Error ? e.message : 'Could not delete that project.')
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  // Toolbar state (#256 review — mirrors the task list): newest-first default
  // with a `?sort=oldest` toggle, plus client-side paging (the projects
  // endpoint is unpaginated; a page of 24 divides the 2/3-column grid evenly).
  const newestFirst = searchParams.get('sort') !== 'oldest'
  function toggleSort() {
    const params = new URLSearchParams(searchParams)
    if (newestFirst) params.set('sort', 'oldest')
    else params.delete('sort')
    setSearchParams(params)
  }
  const PAGE_SIZE = 24
  const [offset, setOffset] = useState(0)
  useEffect(() => setOffset(0), [archived, done, newestFirst])

  const q = search.trim().toLowerCase()
  const matched = q === '' ? projects : projects.filter((p) => p.name.toLowerCase().includes(q))
  const sorted = newestFirst ? matched : [...matched].reverse() // server order is id DESC
  const total = sorted.length
  const visible = sorted.slice(offset, offset + PAGE_SIZE)
  const first = total === 0 ? 0 : offset + 1
  const last = Math.min(offset + PAGE_SIZE, total)
  const countLabel = archived
    ? `${total} archived ${total === 1 ? 'project' : 'projects'}`
    : done
      ? `${total} completed ${total === 1 ? 'project' : 'projects'}`
      : `${total} ${total === 1 ? 'project' : 'projects'} ready to work on`

  return (
    <section>
      {/* Toolbar (#256 review — the task list's layout): pool · sort toggle ·
          count, with the range + pager top right. The Active/Archived pools and
          the New-project plus live in the rail's Projects section. */}
      <div className="mb-2.5 flex items-center gap-2.5 px-1 text-xs text-muted">
        <span className="flex items-center gap-1">
          {archived ? 'Archived' : done ? 'Done' : 'Active'} ·{' '}
          <button
            type="button"
            onClick={toggleSort}
            aria-label={`Sorted ${newestFirst ? 'newest' : 'oldest'} first — switch to ${newestFirst ? 'oldest' : 'newest'} first`}
            className="transition hover:text-primary-ink"
          >
            {newestFirst ? 'newest first' : 'oldest first'}
          </button>
        </span>
        <span className="h-[3px] w-[3px] flex-none rounded-full bg-gray-300" aria-hidden />
        <span className="font-medium text-gray-700 tabular-nums">{countLabel}</span>
        <span className="flex-1" aria-hidden />
        <span className="tabular-nums">{`${first}–${last} of ${total}`}</span>
        {/* Arrows only when there's somewhere to go (#256 review). */}
        {(offset > 0 || last < total) && (
          <div className="flex items-center gap-0.5">
            {offset > 0 && (
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                aria-label="Previous page"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 transition hover:bg-field-hover sm:h-8 sm:w-8"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
            )}
            {last < total && (
              <button
                type="button"
                onClick={() => setOffset((o) => (o + PAGE_SIZE < total ? o + PAGE_SIZE : o))}
                aria-label="Next page"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 transition hover:bg-field-hover sm:h-8 sm:w-8"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
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
      ) : (archived || done) && visible.length === 0 ? (
        <p className="rounded-2xl bg-surface p-10 text-center text-muted">
          {q !== ''
            ? 'Nothing matches your search.'
            : archived
              ? 'No archived projects.'
              : 'No completed projects yet — finish every task in a project and it lands here.'}
        </p>
      ) : (
        // Three-up on wide viewports (#256 review; 77.5rem = the app's 1240px
        // breakpoint — in REM because Tailwind v4 sorts px-unit media queries
        // BEFORE the rem-based `sm`, which made sm:grid-cols-2 win everywhere).
        <div className="grid gap-4 sm:grid-cols-2 min-[77.5rem]:grid-cols-3">
          {visible.map((project) =>
            archived ? (
              <ArchivedProjectCard
                key={project.id}
                project={project}
                onUnarchive={() => void onUnarchive(project)}
                onDelete={() => setConfirmDelete(project)}
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
          {!archived && !done && (
            <button
              type="button"
              onClick={() => setModal(null)}
              className="flex min-h-[9rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 p-5 text-muted transition hover:border-primary hover:text-primary-ink"
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
          onArchive={
            modal
              ? () => {
                  const target = modal
                  setModal(undefined)
                  void onArchive(target)
                }
              : undefined
          }
        />
      )}

      {/* #310: delete confirmation — states the task consequence when N > 0. */}
      {confirmDelete && (
        <Modal titleId={DELETE_TITLE_ID} onClose={() => !deleting && setConfirmDelete(null)}>
          <h2 id={DELETE_TITLE_ID} className="mb-3 text-xl font-bold text-gray-800">
            Delete “{confirmDelete.name}”?
          </h2>
          <p className="mb-5 text-sm leading-relaxed text-muted">
            {confirmDelete.totalCount > 0
              ? `This can't be undone. Its ${confirmDelete.totalCount} ${
                  confirmDelete.totalCount === 1 ? 'task' : 'tasks'
                } will be kept and moved to Unassigned.`
              : "This can't be undone. The project has no tasks."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={() => void onDeleteConfirmed(confirmDelete)}
            >
              {deleting ? 'Deleting…' : 'Delete project'}
            </Button>
          </div>
        </Modal>
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
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 flex-none rounded-[3px] ${projectPole(project.color)}`}
            aria-hidden
          />
          <h3 className="min-w-0 truncate font-bold text-gray-800">{project.name}</h3>
          {/* #310: the auto 'done' state — every task complete. */}
          {project.status === 'done' && (
            <span className="flex-none rounded-full bg-success-tint px-2 py-0.5 text-[11px] font-semibold text-success-ink">
              Done
            </span>
          )}
        </div>
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
            className="inline-flex items-center justify-center rounded-md p-1 text-muted transition hover:bg-gray-100 hover:text-gray-800"
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </button>
              <button
                type="button"
                onClick={onArchive}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
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

      {/* Count-as-link (#245 option a): opens the Dashboard filtered to this
          project's tasks (the #260 rail filter). */}
      <Link
        to={`/dashboard?project=${project.id}`}
        className="mt-3 self-start text-sm font-medium text-muted underline-offset-2 transition hover:text-accent-ink hover:underline"
      >
        {project.totalCount === 0
          ? 'No tasks yet'
          : `${project.remainingCount} of ${project.totalCount} remaining`}
      </Link>

      {/* mt-auto anchors the footer to the card's bottom edge (#256 review —
          cards without a description left the buttons floating); Assign left,
          Add task right. On DONE cards (#321) the leading slot is a first-class
          Archive button instead — on a finished project archiving is the
          natural next action, while assigning would just revert it to active
          (that path stays available via Add task / the kebab). */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {project.status === 'done' ? (
          <button
            type="button"
            onClick={onArchive}
            aria-label={`Archive ${project.name}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-field px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-field-hover sm:min-h-0"
          >
            <Archive className="h-4 w-4" aria-hidden />
            Archive
          </button>
        ) : (
          /* Assign existing tasks — deep-links into the Tasks view's Unassigned
             tab with this project as the ride-along target (#236). */
          <Link
            to={`/dashboard?tab=unassigned&project=${project.id}`}
            className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Assign task
          </Link>
        )}
        <Link
          to={`/tasks/new?project=${project.id}`}
          state={{ from: '/dashboard?view=projects' }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-tint px-3 py-1.5 text-sm font-semibold text-primary-ink transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Add task
        </Link>
      </div>
    </div>
  )
}

/** Archived card (#248): muted, read-only apart from Unarchive — and the #310
 *  permanent Delete (danger-styled; the grid owns the confirm dialog). */
function ArchivedProjectCard({
  project,
  onUnarchive,
  onDelete,
}: {
  project: Project
  onUnarchive: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface p-5 opacity-80">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 flex-none rounded-[3px] opacity-60 ${projectPole(project.color)}`}
            aria-hidden
          />
          <h3 className="min-w-0 truncate font-bold text-gray-600">{project.name}</h3>
        </div>
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
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <button
          type="button"
          onClick={onUnarchive}
          className="inline-flex items-center gap-1.5 rounded-lg bg-field px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-field-hover"
        >
          <ArchiveRestore className="h-4 w-4" aria-hidden />
          Unarchive
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg bg-danger-tint px-3 py-1.5 text-sm font-semibold text-danger-ink transition hover:opacity-80"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete
        </button>
      </div>
    </div>
  )
}
