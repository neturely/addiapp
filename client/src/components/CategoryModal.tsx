import { useState, type FormEvent } from 'react'
import { CircleCheck, Trash2, X } from 'lucide-react'
import { Button } from './Button'
import { ColorSwatchPicker } from './ColorSwatchPicker'
import { Modal } from './Modal'
import { createCategory, updateCategory, type Category } from '@/lib/categories'
import { randomSpectrumColor } from '@/lib/projectColors'
import { useToast } from '@/toast/useToast'

const TITLE_ID = 'category-modal-title'
const MAX_NAME = 255
const MAX_DESCRIPTION = 1000

/**
 * New / Edit category dialog (#276) on the shared Modal primitive (#218) —
 * the ProjectModal pattern with the smaller category field set (name + colour,
 * no description). Owns its form state; on success fires the app toast and
 * hands the saved category back via `onSaved`.
 */
export function CategoryModal({
  category,
  onClose,
  onSaved,
  onDelete,
}: {
  category?: Category
  onClose: () => void
  onSaved: (saved: Category) => void
  /** Edit mode only (#336): Delete lives INSIDE this modal — a low-emphasis
   * trigger handing off to the caller's existing confirm step. */
  onDelete?: () => void
}) {
  const { showToast } = useToast()
  const editing = category !== undefined

  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  // 'random' is the default on New (#308) — resolves to a concrete index on save.
  const [color, setColor] = useState<number | 'random'>(category?.color ?? 'random')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handle(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > MAX_NAME) {
      setError('Give the category a name (up to 255 characters).')
      return
    }
    setSubmitting(true)
    try {
      const concrete = color === 'random' ? randomSpectrumColor() : color
      const input = { name: trimmed, description: description.trim(), color: concrete }
      const saved = editing
        ? await updateCategory(category.id, input)
        : await createCategory(input)
      showToast({
        message: `${editing ? 'Category updated' : 'Category created'}: ${trimmed}`,
        icon: CircleCheck,
        tone: 'success',
      })
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <Modal titleId={TITLE_ID} onClose={onClose}>
      <h2 id={TITLE_ID} className="mb-5 text-center text-2xl font-bold text-gray-800">
        {editing ? 'Edit category' : 'New category'}
      </h2>
      <form onSubmit={handle} className="space-y-5">
        <div>
          <label htmlFor="category-name" className="mb-2 block text-sm font-medium text-gray-600">
            Category name
          </label>
          <input
            id="category-name"
            type="text"
            value={name}
            maxLength={MAX_NAME}
            placeholder="e.g. Errands"
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-gray-100 p-2.5 transition hover:bg-gray-200 field-focus"
          />
        </div>

        <div>
          <label
            htmlFor="category-description"
            className="mb-2 block text-sm font-medium text-gray-600"
          >
            Description <span className="text-muted">(optional)</span>
          </label>
          <textarea
            id="category-description"
            rows={2}
            value={description}
            maxLength={MAX_DESCRIPTION}
            placeholder="What goes in this list?"
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-y rounded-lg bg-gray-100 p-2.5 transition hover:bg-gray-200 field-focus"
          />
        </div>

        <div>
          <span id="category-color-label" className="mb-2 block text-sm font-medium text-gray-600">
            Colour
          </span>
          <ColorSwatchPicker value={color} onChange={setColor} labelledBy="category-color-label" />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
            {submitting
              ? editing
                ? 'Saving…'
                : 'Creating…'
              : editing
                ? 'Save changes'
                : 'Create category'}
          </Button>
          {editing && onDelete && (
            /* Delete rides the action row right of Save (#336 revision) — a
               red icon square at the lg button height, handing off to the
               caller's confirm step. */
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete this category"
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-control bg-danger-tint text-danger-ink transition hover:bg-danger-deep hover:text-white sm:h-[42px] sm:w-[42px]"
            >
              <Trash2 className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
      </form>
      {/* Rendered last so the first focusable element is the name field, not this. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 inline-flex items-center justify-center rounded-md p-1.5 text-muted transition hover:bg-gray-100 hover:text-gray-800"
      >
        <X className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
    </Modal>
  )
}
