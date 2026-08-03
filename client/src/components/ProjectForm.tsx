import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Check, Dices } from 'lucide-react'
import { Button } from '@/components/Button'
import { PROJECT_COLORS, randomSpectrumColor } from '@/lib/projectColors'

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
  // 'random' is the Random cell (#308) — the default on New project; edits
  // start on the project's stored colour. Picker-only: it resolves to a
  // concrete index on save, nothing new is stored server-side.
  const [color, setColor] = useState<number | 'random'>(initial?.color ?? 'random')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Roving-tabindex radiogroup for the colour swatches (#268), matching the
  // TaskForm effort-tile pattern (#197): only the checked swatch is tabbable;
  // arrow keys move selection + focus together (WAI-ARIA radio pattern).
  // Cell 0 is the Random cell (#308); cell i+1 is palette index i.
  const cellCount = PROJECT_COLORS.length + 1
  const checkedCell = color === 'random' ? 0 : color + 1
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([])
  function selectCell(cell: number) {
    setColor(cell === 0 ? 'random' : cell - 1)
  }
  function onSwatchKeyDown(e: KeyboardEvent<HTMLButtonElement>, cell: number) {
    const last = cellCount - 1
    let next = cell
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = cell === last ? 0 : cell + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = cell === 0 ? last : cell - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else return
    e.preventDefault()
    selectCell(next)
    swatchRefs.current[next]?.focus()
  }

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

      <div>
        <span id="project-color-label" className="mb-2 block text-sm font-medium text-gray-600">
          Colour
        </span>
        {/* Random + 19 swatches = 20 cells in two rows of 10 (#256 review, #308). */}
        <div
          role="radiogroup"
          aria-labelledby="project-color-label"
          className="grid grid-cols-10 gap-2"
        >
          <button
            ref={(el) => {
              swatchRefs.current[0] = el
            }}
            type="button"
            role="radio"
            aria-checked={checkedCell === 0}
            aria-label="Random colour"
            tabIndex={checkedCell === 0 ? 0 : -1}
            onClick={() => selectCell(0)}
            onKeyDown={(e) => onSwatchKeyDown(e, 0)}
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-field text-gray-700 transition ${
              checkedCell === 0
                ? 'ring-2 ring-gray-800 ring-offset-2'
                : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-2'
            }`}
          >
            <Dices className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          {PROJECT_COLORS.map((c, i) => {
            const cell = i + 1
            const checked = checkedCell === cell
            return (
              <button
                key={c.name}
                ref={(el) => {
                  swatchRefs.current[cell] = el
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={c.name}
                tabIndex={checked ? 0 : -1}
                onClick={() => selectCell(cell)}
                onKeyDown={(e) => onSwatchKeyDown(e, cell)}
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full ${c.pole} transition ${
                  checked ? 'ring-2 ring-gray-800 ring-offset-2' : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-2'
                }`}
              >
                {checked && (
                  <Check
                    className={`h-4 w-4 ${c.darkCheck ? 'text-gray-800' : 'text-white'}`}
                    strokeWidth={3}
                    aria-hidden
                  />
                )}
              </button>
            )
          })}
        </div>
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
      </div>
    </form>
  )
}
