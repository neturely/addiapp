import { Link } from 'react-router'
import { CircleHelp } from 'lucide-react'

/**
 * The little help dot that explains the scoring (#385): sits top-right of the
 * points panels (right-column Today / All-time, the Stats page) and links the
 * "How points work" guide. A SOLID success-green disc with a BOLD white ?
 * (review rounds — the outlined ring read busy, the grey i read invisible):
 * filling the lucide circle path and stroking in surface turns the icon into
 * exactly that. aria-label + tap-44 per the a11y conventions (#126) — never a
 * native tooltip (#181).
 */
export function PointsHelpLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/how-points-work"
      aria-label="How points work"
      className={`tap-44 inline-flex opacity-75 transition hover:opacity-100 focus-visible:opacity-100 ${className}`}
    >
      <CircleHelp className="h-4 w-4 fill-success stroke-surface" strokeWidth={2.5} aria-hidden />
    </Link>
  )
}
