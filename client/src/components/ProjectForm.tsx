import { useState, type FormEvent } from 'react'

// Mirror the server's validation (#234) so we fail fast client-side.
const MAX_NAME = 255
const MAX_DESCRIPTION = 1000

export type ProjectFormValues = {
  name: string
  /** '' means "no description" (normalized to NULL server-side). */
  description: string
}

type ProjectFormProps = {
  initial?: Partial<ProjectFormValues>
  submitLabel: string
  submittingLabel: string
  onSubmit: (values: ProjectFormValues) => Promise<void>
  onCancel?: () => void
}

/**
 * Shared project fields form (name, description) for the New/Edit project modal
 * (#234). Deliberately NOT TaskForm — projects have their own (smaller) field
 * set. Owns its own validation + error/submitting state; `onSubmit` is async and
 * thrown errors surface inline (matching TaskForm).
 */
export function ProjectForm({
  initial,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
}: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handle(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > MAX_NAME) {
      setError('Give the project a name (up to 255 characters).')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({ name: trimmed, description: description.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handle} className="space-y-5">
      <div>
        <label htmlFor="project-name" className="mb-2 block text-sm font-medium text-gray-600">
          Project name
        </label>
        <input
          id="project-name"
          type="text"
          value={name}
          maxLength={MAX_NAME}
          placeholder="e.g. Kitchen renovation"
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="project-description"
          className="mb-2 block text-sm font-medium text-gray-600"
        >
          Description <span className="text-muted">(optional)</span>
        </label>
        <textarea
          id="project-description"
          rows={2}
          value={description}
          maxLength={MAX_DESCRIPTION}
          placeholder="What is this project about?"
          onChange={(e) => setDescription(e.target.value)}
          className="w-full resize-y rounded-lg bg-gray-100 p-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 cursor-pointer rounded-lg bg-gray-100 py-3 text-xl font-bold text-gray-700 transition hover:bg-gray-200"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 cursor-pointer rounded-lg bg-primary py-3 text-xl font-bold text-white transition hover:opacity-90 disabled:bg-gray-400"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  )
}
