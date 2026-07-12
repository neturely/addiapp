export type TaskComplexity = 'low' | 'medium' | 'high'
export type TaskStatus = 'backlog' | 'in_progress' | 'done'

export type Task = {
  id: number
  title: string
  complexity: TaskComplexity
  estimatedMinutes: number
  status: TaskStatus
}

export type WinSize = 'small' | 'big'

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
