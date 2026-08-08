import { Link } from 'react-router'
import { Info } from 'lucide-react'

/**
 * The little info dot that explains the scoring (#385): sits top-right of the
 * points panels (right-column Today / All-time, the Stats page) and links the
 * "How points work" guide. A SOLID muted disc with a white i (review round —
 * the outlined ?-in-a-ring read too busy): filling the lucide circle path and
 * stroking in surface turns the icon into exactly that. aria-label + tap-44
 * per the a11y conventions (#126) — never a native tooltip (#181).
 */
export function PointsHelpLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/how-points-work"
      aria-label="How points work"
      className={`tap-44 inline-flex transition hover:opacity-75 ${className}`}
    >
      <Info className="h-4 w-4 fill-muted stroke-surface" aria-hidden />
    </Link>
  )
}
