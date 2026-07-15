import { Link } from 'react-router-dom'
import { Mascot } from './Mascot'
import type { WinSize } from '@/lib/tasks'

/** Confetti-dot accents — staggered CSS keyframe (pop/drift/fade), no library. */
const CONFETTI = [
  { color: 'var(--color-primary)', top: '14%', left: '16%', delay: '0s' },
  { color: 'var(--color-success)', top: '22%', left: '80%', delay: '0.5s' },
  { color: 'var(--color-warning)', top: '38%', left: '10%', delay: '0.9s' },
  { color: 'var(--color-accent)', top: '12%', left: '58%', delay: '0.2s' },
  { color: 'var(--color-success)', top: '30%', left: '38%', delay: '1.2s' },
  { color: 'var(--color-warning)', top: '18%', left: '34%', delay: '0.7s' },
  { color: 'var(--color-accent)', top: '40%', left: '72%', delay: '1.5s' },
  { color: 'var(--color-primary)', top: '48%', left: '24%', delay: '0.35s' },
]

type CompletionProps = {
  title: string
  /** Total points earned for this task (from the #28 award). Omitted if not awarded. */
  totalPoints?: number
  /** Daily multiplier applied to this completion (brief context, not a breakdown). */
  multiplier?: number
  /** Filters from the just-completed task's selection, reused by "Keep going". */
  size?: WinSize
  minutes?: number
}

/**
 * Play-mode completion / celebration screen (issue #34). Reached from #33's
 * Complete action, using the pointsAwarded already returned by that PATCH.
 * Shows the TOTAL only (the base/speed/multiplier breakdown belongs on the future
 * dashboard, not here). "Keep going" skips the choice screen and reuses the same
 * win/time filters for a frictionless next task; it falls back to the choice
 * screen when no filters are available.
 */
export function Completion({ title, totalPoints, multiplier, size, minutes }: CompletionProps) {
  const params = new URLSearchParams()
  if (size) params.set('size', size)
  if (minutes != null) params.set('minutes', String(minutes))
  const keepGoingHref = params.toString() ? `/play/task?${params.toString()}` : '/play'

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden p-8 text-center">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className="animate-confetti absolute h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: c.color, top: c.top, left: c.left, animationDelay: c.delay }}
        />
      ))}

      <Mascot expression="celebrating" />
      <h1 className="text-3xl font-bold text-gray-800">Nice work!</h1>
      <p className="text-muted">{title}</p>

      {totalPoints != null && (
        <div className="text-6xl font-extrabold tabular-nums text-primary-ink">+{totalPoints}</div>
      )}

      {multiplier != null && multiplier > 1 && (
        <p className="text-sm text-muted">Current daily bonus: {+multiplier.toFixed(2)}x</p>
      )}

      <Link
        to={keepGoingHref}
        className="mt-2 rounded-xl bg-primary px-8 py-3 text-lg font-semibold text-white transition hover:opacity-90"
      >
        Keep going
      </Link>
    </main>
  )
}
