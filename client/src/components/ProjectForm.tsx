import { useState, type FormEvent } from 'react'
import { Archive } from 'lucide-react'
import { Button } from '@/components/Button'
import { ColorSwatchPicker } from '@/components/ColorSwatchPicker'
import { randomSpectrumColor } from '@/lib/projectColors'

// Mirror the server's validation (#234) so we fail fast client-side.
const MAX_NAME = 255
const MAX_DESCRIPTION = 1000

export type ProjectFormValues = {
  name: string
  /** '' means "no description" (normalized to NULL server-side). */
  description: string
  /** Palette index (#268). */
  color: number
}

type ProjectFormProps = {
  initial?: Partial<ProjectFormValues>
  submitLabel: string
  submittingLabel: string
  onSubmit: (values: ProjectFormValues) => Promise<void>
  onCancel?: () => void
  /** Edit mode (#336): renders an Archive icon square right of Save — the
   * CategoryModal-delete placement, in the calmer secondary tone (archive is
   * reversible, not destructive). */
  onArchive?: () => void
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
  onArchive,
}: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  // 'random' is the Random cell (#308) — the default on New project; edits
  // start on the project's stored colour. Picker-only: it resolves to a
  // concrete index on save, nothing new is stored server-side.
  const [color, setColor] = useState<number | 'random'>(initial?.color ?? 'random')
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
      // Random resolves at save time (#308) — a fresh roll per submit.
      const concrete = color === 'random' ? randomSpectrumColor() : color
      await onSubmit({ name: trimmed, description: description.trim(), color: concrete })
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
          className="w-full rounded-lg bg-gray-100 p-2.5 transition hover:bg-gray-200 field-focus"
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
          className="w-full resize-y rounded-lg bg-gray-100 p-2.5 transition hover:bg-gray-200 field-focus"
        />
      </div>

      <div>
        <span id="project-color-label" className="mb-2 block text-sm font-medium text-gray-600">
          Colour
        </span>
        {/* The shared swatch radiogroup (#276 extraction) — Random cell + 19
            palette swatches, roving tabindex. */}
        <ColorSwatchPicker value={color} onChange={setColor} labelledBy="project-color-label" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Standard button sizing (#256 review — the shared system's `lg`, the
          same as the right column's Play CTA; no more oversized text-xl pair). */}
      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
        {onArchive && (
          <button
            type="button"
            onClick={onArchive}
            aria-label="Archive this project"
            className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-control bg-field text-gray-700 transition hover:bg-field-hover sm:h-[42px] sm:w-[42px]"
          >
            <Archive className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </form>
  )
}
