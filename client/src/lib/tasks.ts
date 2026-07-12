export type TaskComplexity = 'low' | 'medium' | 'high'
export type TaskStatus = 'backlog' | 'in_progress' | 'done'

export type Task = {
  id: number
  title: string
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

/** Fields for creating a task (issue #35 add-task form). */
export type NewTaskInput = {
  title: string
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
 * Minimal JSON fetch. Mirrors the raw-fetch style already used in AuthProvider;
 * a shared api wrapper arrives with #61, so this stays dependency-free until then.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

/** Create a task (issue #35 add-task form → the #27 POST /api/tasks endpoint). */
export async function createTask(input: NewTaskInput): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return task
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
export async function completeTask(id: number): Promise<{ task: Task; pointsAwarded?: AwardResult }> {
  return requestJson<{ task: Task; pointsAwarded?: AwardResult }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  })
}
