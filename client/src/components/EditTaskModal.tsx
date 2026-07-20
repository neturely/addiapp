import { X } from 'lucide-react'
import { CircleCheck } from 'lucide-react'
import { Modal } from './Modal'
import { TaskForm, type TaskFormValues } from './TaskForm'
import { updateTask, type Task } from '@/lib/tasks'
import { useToast } from '@/toast/useToast'

const TITLE_ID = 'edit-task-modal-title'

/**
 * Desktop edit-in-place dialog (#218): opens over the dashboard so the list stays
 * in context, instead of a full-page jump. Reuses TaskForm (same fields as the
 * full page) inside the accessible Modal shell. The `/tasks/:id/edit` full page
 * still backs deep links, refresh, and mobile — this is a desktop-only shortcut.
 *
 * The task is passed in from the dashboard's already-loaded list (no re-fetch). On
 * success it fires the app toast and hands the updated row back via `onSaved`; on
 * failure TaskForm surfaces the error and the dialog stays open.
 */
export function EditTaskModal({
  task,
  onClose,
  onSaved,
}: {
  task: Task
  onClose: () => void
  onSaved: (updated: Task) => void
}) {
  const { showToast } = useToast()

  async function handleSave(values: TaskFormValues) {
    const updated = await updateTask(task.id, values)
    showToast({ message: `Task updated: ${values.title}`, icon: CircleCheck, tone: 'success' })
    onSaved(updated)
  }

  return (
    <Modal titleId={TITLE_ID} onClose={onClose}>
      <h2 id={TITLE_ID} className="mb-5 text-center text-2xl font-bold text-gray-800">
        Edit task
      </h2>
      <TaskForm
        initial={{
          title: task.title,
          description: task.description ?? '',
          complexity: task.complexity,
          estimatedMinutes: task.estimatedMinutes,
        }}
        submitLabel="Save changes"
        submittingLabel="Saving…"
        onSubmit={handleSave}
        onCancel={onClose}
      />
      {/* Rendered last so the first focusable element is the title field, not this. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-muted transition hover:bg-gray-100 hover:text-gray-800"
      >
        <X className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
    </Modal>
  )
}
