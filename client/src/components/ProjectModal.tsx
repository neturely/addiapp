import { CircleCheck, X } from 'lucide-react'
import { Modal } from './Modal'
import { ProjectForm, type ProjectFormValues } from './ProjectForm'
import { createProject, updateProject, type Project } from '@/lib/projects'
import { useToast } from '@/toast/useToast'

const TITLE_ID = 'project-modal-title'

/**
 * New / Edit project dialog (#234) on the shared accessible Modal primitive
 * (#218). Pass a `project` to edit it, or omit for a new one. Reuses ProjectForm
 * (name/description) inside the Modal shell. On success it fires the app toast and
 * hands the saved project back via `onSaved`; on failure ProjectForm surfaces the
 * error and the dialog stays open.
 */
export function ProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project?: Project
  onClose: () => void
  onSaved: (saved: Project) => void
}) {
  const { showToast } = useToast()
  const editing = project !== undefined

  async function handleSubmit(values: ProjectFormValues) {
    const saved = editing ? await updateProject(project.id, values) : await createProject(values)
    showToast({
      message: `${editing ? 'Project updated' : 'Project created'}: ${values.name}`,
      icon: CircleCheck,
      tone: 'success',
    })
    onSaved(saved)
  }

  return (
    <Modal titleId={TITLE_ID} onClose={onClose}>
      <h2 id={TITLE_ID} className="mb-5 text-center text-2xl font-bold text-gray-800">
        {editing ? 'Edit project' : 'New project'}
      </h2>
      <ProjectForm
        initial={
          editing ? { name: project.name, description: project.description ?? '' } : undefined
        }
        submitLabel={editing ? 'Save changes' : 'Create project'}
        submittingLabel={editing ? 'Saving…' : 'Creating…'}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
      {/* Rendered last so the first focusable element is the name field, not this. */}
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
