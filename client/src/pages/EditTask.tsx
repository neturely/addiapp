import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getTask, updateTask, type Task } from '@/lib/tasks'
import { TaskForm, type TaskFormValues } from '@/components/TaskForm'

/**
 * Full-page task edit (issue #36). Opens from the dashboard's per-row Edit action.
 * Today its fields match the dashboard's inline-editable columns; it exists as the
 * home for fields beyond the table's columns (categories, tags, due dates,
 * priorities) as those land — adding one won't force a table redesign.
 */
export function EditTask() {
  const { id } = useParams()
  const taskId = Number(id)
  const navigate = useNavigate()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isInteger(taskId) || taskId <= 0) {
      setError('Invalid task')
      setLoading(false)
      return
    }
    let cancelled = false
    getTask(taskId)
      .then((t) => !cancelled && setTask(t))
      .catch(
        (e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the task'),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [taskId])

  async function onSubmit(values: TaskFormValues) {
    await updateTask(taskId, values)
    navigate('/dashboard')
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <span role="status">Loading…</span>
      </main>
    )
  }

  if (error || !task) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-gray-700">{error ?? 'Task not found'}</p>
        <Link to="/dashboard" className="text-sm text-muted underline hover:text-gray-700">
          Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6">
        <h1 className="mb-5 text-center text-2xl font-bold text-gray-800">Edit task</h1>
        <TaskForm
          initial={{
            title: task.title,
            complexity: task.complexity,
            estimatedMinutes: task.estimatedMinutes,
          }}
          submitLabel="Save changes"
          submittingLabel="Saving…"
          onSubmit={onSubmit}
          onCancel={() => navigate('/dashboard')}
        />
      </div>
    </main>
  )
}
