import { Link } from 'react-router-dom'
import { Mascot } from './Mascot'

/**
 * Play-mode empty state (issue #32): nothing to present. Shown when task
 * selection returns no match. `filtered` distinguishes "your filters matched
 * nothing" (offer to change them) from "no tasks at all".
 *
 * When filtered, the useful recovery is to widen the win/time filter; when the
 * backlog is genuinely empty, adding a task (#35) is the primary action.
 */
export function EmptyState({ filtered = false }: { filtered?: boolean }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Mascot expression="idle" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-800">Nothing here right now</h1>
        <p className="text-muted">
          {filtered
            ? 'No task matches that pick. Try a different kind of win or more time.'
            : 'Your backlog is empty. Add a task to get the ball rolling.'}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Link
          to={filtered ? '/play' : '/tasks/new'}
          className="rounded-lg bg-primary px-6 py-3 text-xl font-bold text-white transition hover:opacity-90"
        >
          {filtered ? 'Pick a different win' : 'Add a task'}
        </Link>
        <Link
          to={filtered ? '/tasks/new' : '/play'}
          className="text-sm text-muted underline hover:text-gray-700"
        >
          {filtered ? 'Add a task' : 'Choose a win'}
        </Link>
      </div>
    </main>
  )
}
