import { Link } from 'react-router-dom'
import { Mascot } from './Mascot'

/**
 * Play-mode empty state (issue #32): nothing to present. Shown when task
 * selection returns no match. `filtered` distinguishes "your filters matched
 * nothing" (offer to change them) from "no tasks at all".
 *
 * The real "Add a task" entry lands with the add-task form (#35) and dashboard
 * (#36); until then the useful recovery is to widen the win/time filter.
 */
export function EmptyState({ filtered = false }: { filtered?: boolean }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Mascot mood="sleepy" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-800">Nothing here right now</h1>
        <p className="text-gray-500">
          {filtered
            ? 'No task matches that pick. Try a different kind of win or more time.'
            : 'Your backlog is empty. Add a task to get the ball rolling.'}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Link
          to="/play"
          className="rounded-lg bg-[#D85A30] px-6 py-3 font-semibold text-white transition hover:bg-[#c24d27]"
        >
          {filtered ? 'Pick a different win' : 'Choose a win'}
        </Link>
        <Link to="/" className="text-sm text-gray-500 underline hover:text-gray-700">
          Back home
        </Link>
      </div>
    </main>
  )
}
