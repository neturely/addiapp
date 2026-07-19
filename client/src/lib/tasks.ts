import { apiRequest } from './api'

export type TaskComplexity = 'low' | 'medium' | 'high'
export type TaskStatus = 'backlog' | 'in_progress' | 'done'

export type Task = {
  id: number
  title: string
  /** Optional free-text description (#184); null when none. */
  description?: string | null
  complexity: TaskComplexity
  estimatedMinutes: number
  status: TaskStatus
  /** ISO timestamp set when the task moved to in_progress (issue #33 timer). */
  startedAt?: string | null
}

/** Points breakdown returned when a task is completed (issue #28). */
export type AwardResult = {
  basePoints: number
  speedBonus: number
  multiplier: number
  totalPoints: number
}

export type WinSize = 'small' | 'big'

/**
 * Parse a `minutes` URL param defensively → a positive integer, else undefined.
 * Guards against `?minutes=NaN`/junk propagating into API calls and routes.
 */
export function parseMinutes(raw: string | null): number | undefined {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** Fields for creating a task (issue #35 add-task form). */
export type NewTaskInput = {
  title: string
  /** Optional description (#184); empty string is normalized to NULL server-side. */
  description?: string | null
  complexity: TaskComplexity
  estimatedMinutes: number
}

export type NextTaskFilters = {
  size?: WinSize
  /** Time available, in minutes. Omitted means "any". */
  minutes?: number
  /** Task id to skip — used by the "give me something else" re-roll. */
  exclude?: number
}

/**
 * Thin alias over the shared `apiRequest` wrapper (issue #101). Delegating here
 * gives every task call status-preserving `ApiError`s and the global 401 handler
 * for free; call-site signatures below are unchanged. `apiRequest` returns null
 * on a 204, which is fine for the `void` delete.
 */
function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(path, init)
}

/** Create a task (issue #35 add-task form → the #27 POST /api/tasks endpoint). */
export async function createTask(input: NewTaskInput): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return task
}

/** List the user's tasks (issue #36 dashboard). Optionally filter by status. */
export async function fetchTasks(status?: TaskStatus): Promise<Task[]> {
  const qs = status ? `?status=${status}` : ''
  const { tasks } = await requestJson<{ tasks: Task[] }>(`/tasks${qs}`)
  return tasks
}

/** Patch a task's editable fields and/or status (issue #36 → #27 PATCH). */
export async function updateTask(
  id: number,
  patch: Partial<NewTaskInput> & { status?: TaskStatus },
): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return task
}

/** Delete a task (issue #36 → #27 DELETE, 204). */
export async function deleteTask(id: number): Promise<void> {
  await requestJson<void>(`/tasks/${id}`, { method: 'DELETE' })
}

/** Play-mode selection (issue #31). Returns one matching backlog task, or null. */
export async function fetchNextTask(filters: NextTaskFilters): Promise<Task | null> {
  const params = new URLSearchParams()
  if (filters.size) params.set('size', filters.size)
  if (filters.minutes != null) params.set('minutes', String(filters.minutes))
  if (filters.exclude != null) params.set('exclude', String(filters.exclude))
  const qs = params.toString()
  const { task } = await requestJson<{ task: Task | null }>(`/tasks/next${qs ? `?${qs}` : ''}`)
  return task
}

/** Start a task → moves it to in_progress (reuses the #27 PATCH endpoint). */
export async function startTask(id: number): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'in_progress' }),
  })
  return task
}

/** Fetch a single owned task (issue #33 in-progress screen). */
export async function getTask(id: number): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>(`/tasks/${id}`)
  return task
}

/**
 * Complete a task → done. Awards points on the first completion (issue #28), so
 * `pointsAwarded` is present the first time and omitted if it was already done.
 */
export async function completeTask(
  id: number,
): Promise<{ task: Task; pointsAwarded?: AwardResult }> {
  return requestJson<{ task: Task; pointsAwarded?: AwardResult }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  })
}
