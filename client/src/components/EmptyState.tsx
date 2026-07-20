import { Link } from 'react-router-dom'
import { Plus, RotateCw } from 'lucide-react'
import { Mascot } from './Mascot'
import { PlayCard } from './PlayCard'

/**
 * Play-mode empty state (issue #32; card redesign #183; PlayCard migration #208).
 * Shown when task selection returns no match. `filtered` distinguishes "your
 * filters matched nothing" from "no tasks at all" (copy only). On the shared
 * `PlayCard` skeleton: Add-a-task is the full-width primary, re-pick is a
 * secondary link (#208 decision — was two equal buttons in #183).
 */
export function EmptyState({ filtered = false }: { filtered?: boolean }) {
  return (
    <PlayCard
      mascot={<Mascot expression="idle" halo className="h-24 w-24" />}
      title={<h1 className="text-2xl font-bold text-gray-800">Nothing here right now</h1>}
      body={
        <p className="text-muted">
          {filtered
            ? 'No task matches that pick. Try a different kind of win or more time.'
            : 'Your backlog is empty. Add a task to get the ball rolling.'}
        </p>
      }
      primary={
        <Link
          to="/tasks/new"
          state={{ from: '/play' }}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary py-3 text-xl font-bold text-white transition hover:opacity-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          Add a task
        </Link>
      }
      secondary={
        <Link
          to="/play"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-muted transition hover:bg-primary-tint hover:text-primary-ink"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Try a different pick
        </Link>
      }
    />
  )
}
