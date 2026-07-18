import { Link } from 'react-router-dom'
import { Plus, RotateCw } from 'lucide-react'
import { Mascot } from './Mascot'
import { CardScreen } from './CardScreen'

/**
 * Play-mode empty state (issue #32; card redesign #183). Shown when task
 * selection returns no match. `filtered` distinguishes "your filters matched
 * nothing" (widen the pick) from "no tasks at all" — it changes the copy; the
 * actions are the same pair: Retry (re-pick a win) + Add (a task). Uses the
 * shared white-card shell (#183) and the mascot's real golden colour, idle.
 */
export function EmptyState({ filtered = false }: { filtered?: boolean }) {
  return (
    <CardScreen>
      <Mascot expression="idle" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-800">Nothing here right now</h1>
        <p className="text-muted">
          {filtered
            ? 'No task matches that pick. Try a different kind of win or more time.'
            : 'Your backlog is empty. Add a task to get the ball rolling.'}
        </p>
      </div>
      <div className="flex w-full gap-3">
        <Link
          to="/play"
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gray-100 py-3 text-xl font-bold text-gray-700 transition hover:bg-gray-200"
        >
          <RotateCw className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          Retry
        </Link>
        <Link
          to="/tasks/new"
          state={{ from: '/play' }}
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary py-3 text-xl font-bold text-white transition hover:opacity-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          Add
        </Link>
      </div>
    </CardScreen>
  )
}
