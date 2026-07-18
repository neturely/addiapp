import { useLocation, useNavigate } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { createTask } from '@/lib/tasks'
import { TaskForm, type TaskFormValues } from '@/components/TaskForm'
import { useToast } from '@/toast/useToast'

/**
 * Add-task screen (issue #35). Wraps the shared TaskForm (also used by the
 * dashboard edit page, #36) and creates a task via the #27 POST /api/tasks.
 * Reachable from the empty state and the dashboard.
 *
 * On success it fires an app-wide toast ("Task added: …" + a Play action) and
 * returns to wherever the user came from (#176) — the origin is passed in
 * `location.state.from` by the entry link, falling back to browser-back. The
 * toast lives in the AppLayout provider, so it survives that navigation.
 */
export function AddTask() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()

  const from = (location.state as { from?: string } | null)?.from
  const returnToOrigin = () => (from ? navigate(from) : navigate(-1))

  async function onSubmit(values: TaskFormValues) {
    await createTask(values)
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
      <div className="w-full max-w-md rounded-2xl bg-surface p-6">
        <h1 className="mb-5 text-center text-2xl font-bold text-gray-800">Add a task</h1>
        <TaskForm
          submitLabel="Add task"
          submittingLabel="Adding…"
          onSubmit={onSubmit}
          onCancel={returnToOrigin}
        />
      </div>
    </main>
  )
}
