import { apiRequest } from './api'

/** 'done' (#310) is automatic and reversible — set server-side when every task
 *  is done, cleared when an unfinished task appears. Only 'active'/'archived'
 *  are ever PATCHed by the client. */
export type ProjectStatus = 'active' | 'done' | 'archived'

/**
 * A user's project (#234) — a grouping of tasks. `totalCount` / `remainingCount`
 * come from the server's grouped count query ("3 of 7 remaining" = remaining of
 * total, remaining = not-done).
 */
export type Project = {
  id: number
  name: string
  /** Optional free-text description; null when none. */
  description?: string | null
  status: ProjectStatus
  /** Palette index into PROJECT_COLORS (#268). */
  color: number
  totalCount: number
  remainingCount: number
  createdAt: string
  updatedAt: string
}

/** Fields for creating/editing a project. */
export type ProjectInput = {
  name: string
  /** Optional; empty string is normalized to NULL server-side. */
  description?: string | null
  /** Palette index (#268); server-bounded, defaults to 0. */
  color?: number
}

/**
 * Thin alias over the shared `apiRequest` wrapper (#101) — mirrors lib/tasks so
 * every projects call gets status-preserving `ApiError`s + the global 401 handler.
 */
function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(path, init)
}

/**
 * Fired on window after any project mutation (#268) so passive listeners (the
 * shell rail) can refetch without polling — modal create/archive doesn't
 * navigate, so a route-change refresh alone would go stale.
 */
export const PROJECTS_CHANGED_EVENT = 'addiapp:projects-changed'

function notifyProjectsChanged() {
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
}

/**
 * List the user's projects with task counts (#234 Projects grid). Defaults to
 * ACTIVE only (the pre-#260 behaviour); pass `'archived'` or `'all'` for the
 * archived-browsing view (#248 → #260).
 */
export async function fetchProjects(status?: ProjectStatus | 'all'): Promise<Project[]> {
  const qs = status && status !== 'active' ? `?status=${status}` : ''
  const { projects } = await requestJson<{ projects: Project[] }>(`/projects${qs}`)
  return projects
}

/** Create a project → the #234 POST /api/projects endpoint. */
export async function createProject(input: ProjectInput): Promise<Project> {
  const { project } = await requestJson<{ project: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  notifyProjectsChanged()
  return project
}

/** Patch a project's name/description/colour and/or status (Archive = 'archived'). */
export async function updateProject(
  id: number,
  patch: Partial<ProjectInput> & { status?: 'active' | 'archived' },
): Promise<Project> {
  const { project } = await requestJson<{ project: Project }>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  notifyProjectsChanged()
  return project
}

/**
 * Permanently delete an ARCHIVED project (#310) — the server enforces the
 * archived-only rule. Tasks are never deleted; they return to Unassigned, and
 * the response carries how many did (for the confirmation toast).
 */
export async function deleteProject(id: number): Promise<{ unassignedTasks: number }> {
  const res = await requestJson<{ unassignedTasks: number }>(`/projects/${id}`, {
    method: 'DELETE',
  })
  notifyProjectsChanged()
  return res
}
