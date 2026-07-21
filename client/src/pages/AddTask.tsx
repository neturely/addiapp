import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { createTask } from '@/lib/tasks'
import { fetchProjects, type Project } from '@/lib/projects'
import { TaskForm, type TaskFormValues } from '@/components/TaskForm'
import { FormCard } from '@/components/FormCard'
import { useToast } from '@/toast/useToast'

/**
 * Add-task screen (issue #35). Wraps the shared TaskForm (also used by the
 * dashboard edit page, #36) and creates a task via the #27 POST /api/tasks.
 * Reachable from the empty state and the dashboard.
 *
 * With `?project=ID` (#234), the task is created into that project: the id is
 * resolved against the user's active projects (so a stale/foreign id is simply
 * ignored rather than causing a 400), a read-only "Adding to <project>" line is
 * shown, and the id rides along in `createTask`.
 *
 * On success it fires an app-wide toast ("Task added: …" + a Play action) and
 * returns to wherever the user came from (#176) — the origin is passed in
 * `location.state.from` by the entry link, falling back to browser-back. The
 * toast lives in the AppLayout provider, so it survives that navigation.
 */
export function AddTask() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()

  const from = (location.state as { from?: string } | null)?.from
  const returnToOrigin = () => (from ? navigate(from) : navigate(-1))

  // Resolve `?project=ID` to a real active project so we only ever show + submit a
  // valid one. A whole-list fetch is fine (the set is small and user-scoped).
  const rawProjectId = Number(searchParams.get('project'))
  const wantProjectId = Number.isInteger(rawProjectId) && rawProjectId > 0 ? rawProjectId : null
  const [project, setProject] = useState<Project | null>(null)
  useEffect(() => {
    if (wantProjectId === null) return
    let cancelled = false
    fetchProjects()
      .then((list) => !cancelled && setProject(list.find((p) => p.id === wantProjectId) ?? null))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [wantProjectId])

  async function onSubmit(values: TaskFormValues) {
    await createTask(project ? { ...values, projectId: project.id } : values)
    showToast({
      message: `Task added: ${values.title}`,
      icon: CircleCheck,
      tone: 'success',
      action: { label: 'Play', onClick: () => navigate('/play') },
    })
    returnToOrigin()
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <FormCard title="Add a task" headingLevel="h1" align="center" className="w-full max-w-md">
        {project && (
          <p className="mb-4 text-center text-sm text-muted">
            Adding to <span className="font-semibold text-gray-800">{project.name}</span>
          </p>
        )}
        <TaskForm
          submitLabel="Add task"
          submittingLabel="Adding…"
          onSubmit={onSubmit}
          onCancel={returnToOrigin}
        />
      </FormCard>
    </main>
  )
}
