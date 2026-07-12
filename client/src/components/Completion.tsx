import { Link } from 'react-router-dom'
import { Mascot } from './Mascot'
import type { WinSize } from '@/lib/tasks'

/** A few static confetti-dot accents — moderate ceremony, no animation library. */
const CONFETTI = [
  { color: '#D85A30', top: '14%', left: '16%', pulse: true },
  { color: '#2FA39B', top: '22%', left: '80%', pulse: false },
  { color: '#F5A623', top: '38%', left: '10%', pulse: false },
  { color: '#8B5CF6', top: '12%', left: '58%', pulse: true },
  { color: '#2FA39B', top: '30%', left: '38%', pulse: false },
  { color: '#F5A623', top: '18%', left: '34%', pulse: true },
  { color: '#8B5CF6', top: '40%', left: '72%', pulse: false },
  { color: '#D85A30', top: '48%', left: '24%', pulse: false },
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
          className={`absolute h-2.5 w-2.5 rounded-full ${c.pulse ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: c.color, top: c.top, left: c.left }}
        />
      ))}

      <Mascot mood="happy" />
      <h1 className="text-3xl font-bold text-gray-800">Nice work!</h1>
      <p className="text-gray-500">{title}</p>

      {totalPoints != null && (
        <div className="text-6xl font-extrabold tabular-nums text-[#D85A30]">+{totalPoints}</div>
      )}

      {multiplier != null && multiplier > 1 && (
        <p className="text-sm text-gray-400">Current daily bonus: {+multiplier.toFixed(2)}x</p>
      )}

      <div className="mt-2 flex flex-col gap-3">
        <Link
          to={keepGoingHref}
          className="rounded-xl bg-[#D85A30] px-8 py-3 text-lg font-semibold text-white transition hover:bg-[#c24d27]"
        >
          Keep going
        </Link>
        <Link to="/" className="text-sm text-gray-500 underline hover:text-gray-700">
          Back to home
        </Link>
      </div>
    </main>
  )
}
