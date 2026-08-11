import { useRef, type KeyboardEvent } from 'react'
import { Check, Dices } from 'lucide-react'
import { PROJECT_COLORS } from '@/lib/projectColors'

/**
 * The palette swatch radiogroup (#268/#308), extracted from ProjectForm for the
 * category form (#276): a leading Random dice cell + the 19 palette swatches,
 * as a roving-tabindex radiogroup (WAI-ARIA radio pattern — only the checked
 * cell is tabbable; arrows move selection + focus together). 'random' resolves
 * to a concrete index at save time in the OWNING form, never here.
 */
export function ColorSwatchPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: number | 'random'
  onChange: (next: number | 'random') => void
  labelledBy: string
}) {
  // Cell 0 is the Random cell (#308); cell i+1 is palette index i.
  const cellCount = PROJECT_COLORS.length + 1
  const checkedCell = value === 'random' ? 0 : value + 1
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([])
  function selectCell(cell: number) {
    onChange(cell === 0 ? 'random' : cell - 1)
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

  return (
    // Random + 19 swatches = 20 cells in two rows of 10 (#256 review, #308).
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-10 gap-2">
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
        className={`flex h-8 w-8 items-center justify-center rounded-full bg-field text-gray-700 transition ${
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
            className={`flex h-8 w-8 items-center justify-center rounded-full ${c.pole} transition ${
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
  )
}
