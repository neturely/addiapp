import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mascot } from './Mascot'
import { PlayCard } from './PlayCard'
import { fetchUserStats } from '@/lib/points'
import type { PlayMode, ProjectCompletion, WinSize } from '@/lib/tasks'

/**
 * Confetti-dot accents (#94 B1), repositioned to the card's corners (#181) rather
 * than scattered across the page. Positions are relative to the card wrapper;
 * negative offsets let a few peek just outside the card edge. `animate-confetti`
 * (pop/drift/fade) is disabled under prefers-reduced-motion.
 */
const CONFETTI = [
  { color: 'var(--color-primary)', pos: '-top-2 left-6', delay: '0s' },
  { color: 'var(--color-success)', pos: '-top-3 right-10', delay: '0.5s' },
  { color: 'var(--color-accent)', pos: 'top-8 -left-2', delay: '0.2s' },
  { color: 'var(--color-warning)', pos: 'top-12 -right-2', delay: '0.9s' },
  { color: 'var(--color-accent)', pos: '-bottom-2 left-10', delay: '0.35s' },
  { color: 'var(--color-primary)', pos: '-bottom-3 right-8', delay: '1.2s' },
  { color: 'var(--color-success)', pos: 'bottom-10 -left-3', delay: '0.7s' },
  { color: 'var(--color-warning)', pos: 'bottom-14 -right-3', delay: '1.5s' },
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
  /** "Focus on projects" mode (#238) — carried so "Keep going" stays in projects mode. */
  mode?: PlayMode
  /** Project-completion bonus (#240) when this task finished its project. */
  projectBonus?: ProjectCompletion | null
}

/**
 * Play-mode completion / celebration screen (issue #34; card redesign #181).
 * Reached from #33's Complete action, using the pointsAwarded already returned by
 * that PATCH. Content sits in a white card (matching InProgress); the points land
 * in a tinted panel with a streak/daily-bonus context line beneath. Shows the
 * TOTAL only (the base/speed/multiplier breakdown belongs on the dashboard). "Keep
 * going" skips the choice screen and reuses the same win/time filters.
 *
 * NOTE (#181): this white-card treatment is a good candidate to become the shared
 * celebratory/confirmation pattern (the empty state, #183, is the next adopter).
 */
export function Completion({
  title,
  totalPoints,
  multiplier,
  size,
  minutes,
  mode,
  projectBonus,
}: CompletionProps) {
  const params = new URLSearchParams()
  if (mode) params.set('mode', mode)
  else if (size) params.set('size', size)
  if (minutes != null) params.set('minutes', String(minutes))
  const keepGoingHref = params.toString() ? `/play/task?${params.toString()}` : '/play'

  // Streak for the context line — post-completion, so it reflects this task (#181).
  const [streak, setStreak] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchUserStats()
      .then((s) => !cancelled && setStreak(s.streak.currentDays))
      .catch(() => undefined) // context line is best-effort, non-blocking
    return () => {
      cancelled = true
    }
  }, [])

  // This screen renders in place (no route change), so RouteFocus can't catch it
  // (#126). Focus the heading on mount to move SR/keyboard focus here; its
  // aria-label carries the full outcome incl. points so it's announced as one
  // message (a live region wouldn't fire for content present on first render).
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const announcement =
    (totalPoints != null
      ? `Nice work! ${title} complete. You earned ${totalPoints} points.`
      : `Nice work! ${title} complete.`) +
    (projectBonus
      ? ` Project ${projectBonus.name} complete — bonus ${projectBonus.bonus} points!`
      : '')

  const contextParts: string[] = []
  if (streak != null && streak > 0) contextParts.push(`🔥 Day ${streak} streak`)
  if (multiplier != null && multiplier > 1)
    contextParts.push(`×${+multiplier.toFixed(2)} daily bonus`)

  const confetti = CONFETTI.map((c, i) => (
    <span
      key={i}
      aria-hidden
      className={`animate-confetti absolute h-2.5 w-2.5 rounded-full ${c.pos}`}
      style={{ backgroundColor: c.color, animationDelay: c.delay }}
    />
  ))

  return (
    <PlayCard
      decoration={confetti}
      mascot={<Mascot expression="celebrating" halo className="h-24 w-24" />}
      title={
        <h1
          ref={headingRef}
          tabIndex={-1}
          aria-label={announcement}
          className="text-3xl font-bold text-gray-800 focus:outline-none"
        >
          Nice work!
        </h1>
      }
      body={<p className="text-muted">{title}</p>}
      context={
        totalPoints != null || projectBonus ? (
          <div className="flex flex-col gap-3">
            {totalPoints != null && (
              <div className="rounded-2xl bg-primary-tint px-6 py-4">
                <div className="text-6xl font-extrabold tabular-nums text-primary-ink">
                  +{totalPoints}
                </div>
                {contextParts.length > 0 && (
                  <p className="mt-1 text-sm font-semibold text-primary-ink">
                    {contextParts.join(' · ')}
                  </p>
                )}
              </div>
            )}
            {/* Project-completion bonus (#240) — accent-themed, aria-hidden since the
                heading's aria-label already announces it as one message. */}
            {projectBonus && (
              <div className="rounded-2xl bg-accent-tint px-6 py-3" aria-hidden>
                <div className="text-sm font-bold text-accent-ink">
                  🎉 Project complete: {projectBonus.name}
                </div>
                <div className="text-3xl font-extrabold tabular-nums text-accent-ink">
                  +{projectBonus.bonus} bonus
                </div>
              </div>
            )}
          </div>
        ) : undefined
      }
      primary={
        <Link
          to={keepGoingHref}
          className="block w-full rounded-xl bg-primary py-3 text-xl font-bold text-white transition hover:opacity-90"
        >
          Keep going
        </Link>
      }
    />
  )
}
