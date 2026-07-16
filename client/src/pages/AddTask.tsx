import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { createTask } from '@/lib/tasks'
import { TaskForm, type TaskFormValues } from '@/components/TaskForm'

/**
 * Add-task screen (issue #35). Wraps the shared TaskForm (also used by the
 * dashboard edit page, #36) and creates a task via the #27 POST /api/tasks.
 * Reachable from the empty state, Home, and the dashboard.
 */
export function AddTask() {
  const navigate = useNavigate()
  const [addedTitle, setAddedTitle] = useState<string | null>(null)
  // Bumped to remount a fresh form for "Add another".
  const [formKey, setFormKey] = useState(0)

  async function onSubmit(values: TaskFormValues) {
    await createTask(values)
    setAddedTitle(values.title)
  }

  if (addedTitle) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
        <CircleCheck className="h-12 w-12 text-success-ink" />
        <h1 className="text-2xl font-bold text-gray-800">Task added</h1>
        <p className="text-muted">
          <span className="font-semibold text-gray-700">{addedTitle}</span> is in your backlog.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              setAddedTitle(null)
              setFormKey((k) => k + 1)
            }}
            className="rounded-lg bg-gray-100 px-6 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
          >
            Add another
          </button>
          <Link
            to="/play"
            className="rounded-lg bg-primary px-6 py-3 text-xl font-bold text-white transition hover:opacity-90"
          >
            Let&apos;s play
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6">
        <h1 className="mb-5 text-center text-2xl font-bold text-gray-800">Add a task</h1>
        <TaskForm key={formKey} submitLabel="Add task" submittingLabel="Adding…" onSubmit={onSubmit} />
        <div className="mt-4 text-center text-sm">
          <button onClick={() => navigate(-1)} className="text-muted underline hover:text-gray-700">
            Cancel
          </button>
        </div>
      </div>
    </main>
  )
}
