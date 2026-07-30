import { apiRequest } from './api'

export type ProjectStatus = 'active' | 'archived'

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
}

/**
 * Thin alias over the shared `apiRequest` wrapper (#101) — mirrors lib/tasks so
 * every projects call gets status-preserving `ApiError`s + the global 401 handler.
 */
function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(path, init)
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
  return project
}

/** Patch a project's name/description and/or status (Archive = status 'archived'). */
export async function updateProject(
  id: number,
  patch: Partial<ProjectInput> & { status?: ProjectStatus },
): Promise<Project> {
  const { project } = await requestJson<{ project: Project }>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return project
}
