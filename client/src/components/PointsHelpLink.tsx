import { Link } from 'react-router'
import { CircleHelp } from 'lucide-react'

/**
 * The little ? that explains the scoring (#385): sits top-right of the points
 * panels (right-column Today / All-time, the Stats page) and links the
 * "How points work" guide. aria-label + tap-44 per the a11y conventions (#126)
 * — never a native tooltip (#181).
 */
export function PointsHelpLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/how-points-work"
      aria-label="How points work"
      className={`tap-44 inline-flex text-muted transition hover:text-gray-700 ${className}`}
    >
      <CircleHelp className="h-4 w-4" aria-hidden />
    </Link>
  )
}
