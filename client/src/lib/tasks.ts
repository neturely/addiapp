import { apiRequest } from './api'
import { notifyProjectsChanged } from './projects'

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
  /** Owning project id (#234); null when unassigned. */
  projectId?: number | null
  /** Joined project name + palette colour (#268) — present on LIST responses
   * only (the server's LEFT JOIN); null when unassigned. */
  project?: { name: string; color: number } | null
  /** Owning category id (#276); null when uncategorized. */
  categoryId?: number | null
  /** Joined category name + palette colour (#276) — LIST responses only. */
  category?: { name: string; color: number } | null
  /** Points actually earned on completion (LIST only; null until done). */
  earnedPoints?: number | null
  /** ISO timestamp set when the task moved to in_progress (issue #33 timer). */
  startedAt?: string | null
  /** ISO timestamp when the task was filed away (#312); null = not archived. */
  archivedAt?: string | null
  /** Snooze-until date (#250, plain Y-m-d); Play skips the task before it. */
  availableFrom?: string | null
  /** Recurrence rule (#250); null/absent = not recurring. */
  recurrence?: Recurrence | null
  /** ISO creation timestamp — the task view's "added N days ago" line (#262). */
  createdAt?: string
}

/** Recurrence rule (#250): every N days/weeks/months, XOR monthly on day D. */
export type Recurrence = { unit: 'day' | 'week' | 'month'; interval: number } | { dayOfMonth: number }

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
  /** Optional project to create the task into (#234); must be an active owned project. */
  projectId?: number
  /** Optional category to create the task into (#276); must be owned. */
  categoryId?: number
  /** Snooze-until date (#250, Y-m-d); null/absent = available now. */
  availableFrom?: string | null
  /** Recurrence rule (#250); null clears it on update. */
  recurrence?: Recurrence | null
}

/** Play-mode pick strategy. Default (win-type) unless `projects` (#238). */
export type PlayMode = 'projects'

export type NextTaskFilters = {
  size?: WinSize
  /** Time available, in minutes. Omitted means "any". */
  minutes?: number
  /** Task id to skip — used by the "give me something else" re-roll. */
  exclude?: number
  /** "Focus on projects" mode (#238): win-type ignored; pick from active projects. */
  mode?: PlayMode
  /** Scope the pick to one owned category (#276) — composes with every mode. */
  category?: number
}

/** Which Play Choice options can produce a task at any time (#306). */
export type TaskAvailability = {
  small: boolean
  big: boolean
  projects: boolean
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

/** Can each Choice option yield a task (#306)? Time filter deliberately absent. */
export function fetchTaskAvailability(): Promise<TaskAvailability> {
  return requestJson<TaskAvailability>('/tasks/availability')
}

/** Create a task (issue #35 add-task form → the #27 POST /api/tasks endpoint). */
export async function createTask(input: NewTaskInput): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  // Creating into a project can revert a done one to active (#310).
  if (input.projectId != null) notifyProjectsChanged()
  return task
}

/** List the user's tasks (issue #36 dashboard). Optionally filter by status.
 * Unbounded — used where the full set is wanted (e.g. InProgressProvider). The
 * dashboard uses the paginated `fetchTasksPage` instead (#100). */
export async function fetchTasks(status?: TaskStatus): Promise<Task[]> {
  const qs = status ? `?status=${status}` : ''
  const { tasks } = await requestJson<{ tasks: Task[] }>(`/tasks${qs}`)
  return tasks
}

/** Per-status task counts for the dashboard tab bar (#100), returned on page 1.
 * `unassigned` (#236) is a separate axis: tasks with no project, any status. */
export type TaskCounts = {
  all: number
  backlog: number
  in_progress: number
  done: number
  unassigned: number
  /** Filed-away done tasks (#312) — outside every other figure. */
  archived: number
}

/** One page of the dashboard task list (#262 — offset pagination, superseding
 * #100's keyset cursor). `total` is the filtered total for the "X–Y of Z" range;
 * `counts` are the global per-status figures and ride every page. */
export type TaskPage = {
  tasks: Task[]
  total: number
  counts: TaskCounts
}

/**
 * Fetch one offset page of the dashboard task list (#262). Filters apply
 * server-side (required for correct paging); `offset` is 0-based row offset
 * (omit for the first page).
 */
export async function fetchTasksPage(opts: {
  status?: TaskStatus
  /** #236 Unassigned tab: tasks with no project (a different axis than status). */
  unassigned?: boolean
  /** #260 rail per-project filter (backend half of #245): one owned project's
   * tasks, any status. Non-enumerating — a foreign id 404s. */
  projectId?: number
  /** #276 rail per-category filter — same rules as projectId. */
  categoryId?: number
  /** #312 archive view: only filed-away tasks (default lists exclude them). */
  archived?: boolean
  limit: number
  offset?: number
  /** Row order: 'asc' (oldest first, the default) or 'desc' (newest first). */
  order?: 'asc' | 'desc'
}): Promise<TaskPage> {
  const params = new URLSearchParams()
  if (opts.status) params.set('status', opts.status)
  if (opts.unassigned) params.set('unassigned', '1')
  if (opts.projectId != null) params.set('projectId', String(opts.projectId))
  if (opts.categoryId != null) params.set('categoryId', String(opts.categoryId))
  if (opts.archived) params.set('archived', '1')
  params.set('limit', String(opts.limit))
  if (opts.offset) params.set('offset', String(opts.offset))
  if (opts.order === 'desc') params.set('order', 'desc')
  return requestJson<TaskPage>(`/tasks?${params.toString()}`)
}

/** Patch a task's editable fields and/or status (issue #36 → #27 PATCH).
 * `projectId: null` unassigns (#236 semantics). */
export async function updateTask(
  id: number,
  patch: Partial<Omit<NewTaskInput, 'projectId' | 'categoryId'>> & {
    status?: TaskStatus
    projectId?: number | null
    /** #276 semantics mirror projectId: an int assigns, null unlabels. */
    categoryId?: number | null
    /** #312 archive flag — the task view sends false to un-file (#330). */
    archived?: boolean
  },
): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  // A status change or (re)assignment can move the task's project between
  // active ⇄ done and shift its remaining count (#310) — ping the rail.
  if ('status' in patch || 'projectId' in patch) notifyProjectsChanged()
  return task
}

/** Delete a task (issue #36 → #27 DELETE, 204). */
export async function deleteTask(id: number): Promise<void> {
  await requestJson<void>(`/tasks/${id}`, { method: 'DELETE' })
  // Removing the last unfinished task can complete its project (#310).
  notifyProjectsChanged()
}

/**
 * Assign a task to a project, or unassign it (#236). `projectId` must be an
 * active project the caller owns; `null` clears the assignment. Reuses the #27
 * PATCH endpoint.
 */
export async function assignTaskToProject(id: number, projectId: number | null): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ projectId }),
  })
  // Assignment can reactivate a done/archived project (#310) and always
  // shifts remaining counts — ping the rail.
  notifyProjectsChanged()
  return task
}

/**
 * Archive or unarchive a DONE task (#312) — a flag beside status, not a status
 * transition (the server rejects archiving a non-done task). Pings the rail so
 * the Done/Archived counts move without a navigation.
 */
export async function archiveTask(id: number, archived: boolean): Promise<Task> {
  const { task } = await requestJson<{ task: Task }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived }),
  })
  notifyProjectsChanged()
  return task
}

/** Play-mode selection (issue #31). Returns one matching backlog task, or null. */
export async function fetchNextTask(filters: NextTaskFilters): Promise<Task | null> {
  const params = new URLSearchParams()
  if (filters.mode) params.set('mode', filters.mode)
  else if (filters.size) params.set('size', filters.size) // win-type is ignored in projects mode
  if (filters.minutes != null) params.set('minutes', String(filters.minutes))
  if (filters.exclude != null) params.set('exclude', String(filters.exclude))
  if (filters.category != null) params.set('category', String(filters.category))
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

/** Project-completion bonus returned when a task-complete finishes its project (#240). */
export type ProjectCompletion = { projectId: number; name: string; bonus: number }

/**
 * Complete a task → done. Awards points on the first completion (issue #28), so
 * `pointsAwarded` is present the first time and omitted if it was already done.
 * `projectCompleted` (#240) is present only when this completion finished the
 * task's project (all its tasks done) — the once-ever project bonus.
 * `recursAt` (#250) is present when completing a recurring task spawned its
 * next occurrence — the Y-m-d date it comes back.
 */
export async function completeTask(
  id: number,
): Promise<{
  task: Task
  pointsAwarded?: AwardResult
  projectCompleted?: ProjectCompletion
  recursAt?: string
}> {
  const res = await requestJson<{
    task: Task
    pointsAwarded?: AwardResult
    projectCompleted?: ProjectCompletion
    recursAt?: string
  }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  })
  // Completing the last task auto-marks its project done (#310) — ping the rail.
  notifyProjectsChanged()
  return res
}
