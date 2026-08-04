import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Check } from 'lucide-react'
import { Mascot } from './Mascot'
import { CONFETTI } from './confetti'
import { PlayCard } from './PlayCard'
import { fetchUserStats } from '@/lib/points'
import { archiveTask, type PlayMode, type ProjectCompletion, type WinSize } from '@/lib/tasks'


type CompletionProps = {
  title: string
  /** The just-completed task's id (#312) — enables the archive shortcut beside
   *  "Keep going". Omitted = no archive button (e.g. contexts without the id). */
  taskId?: number
  /** Total points earned for this task (from the #28 award). Omitted if not awarded. */
  totalPoints?: number
  /** Daily multiplier applied to this completion (brief context, not a breakdown). */
  multiplier?: number
  /** Filters from the just-completed task's selection, reused by "Keep going". */
  size?: WinSize
  minutes?: number
  /** "Focus on projects" mode (#238) — carried so "Keep going" stays in projects mode. */
  mode?: PlayMode
  /** Category scope (#276) — carried so "Keep going" stays in the same list. */
  category?: number
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
  taskId,
  totalPoints,
  multiplier,
  size,
  minutes,
  mode,
  category,
  projectBonus,
}: CompletionProps) {
  const params = new URLSearchParams()
  if (mode) params.set('mode', mode)
  else if (size) params.set('size', size)
  if (minutes != null) params.set('minutes', String(minutes))
  if (category != null) params.set('category', String(category))
  const keepGoingHref = params.toString() ? `/play/task?${params.toString()}` : '/play'

  // Archive shortcut (#312): file the just-completed task away at the
  // celebration moment — no navigation, "Keep going" stays primary.
  const [filing, setFiling] = useState<'idle' | 'busy' | 'done'>('idle')
  async function fileAway() {
    if (taskId == null || filing !== 'idle') return
    setFiling('busy')
    try {
      await archiveTask(taskId, true)
      setFiling('done')
    } catch {
      setFiling('idle') // quiet failure — the Done tab archive remains
    }
  }

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
        <div className="flex items-stretch gap-2">
          <Link
            to={keepGoingHref}
            className="block flex-1 rounded-xl bg-primary py-3 text-xl font-bold text-white transition hover:opacity-90"
          >
            Keep going
          </Link>
          {/* Archive shortcut (#312) — compact secondary beside the CTA. */}
          {taskId != null && (
            <button
              type="button"
              onClick={() => void fileAway()}
              disabled={filing !== 'idle'}
              aria-label={filing === 'done' ? 'Archived' : 'Archive this task'}
              className="tap-44 inline-flex w-14 flex-none cursor-pointer items-center justify-center rounded-xl bg-field text-gray-700 transition hover:bg-field-hover disabled:cursor-default disabled:opacity-80"
            >
              {filing === 'done' ? (
                <Check className="h-5 w-5 text-success-ink" strokeWidth={2.5} aria-hidden />
              ) : (
                <Archive className="h-5 w-5" strokeWidth={2} aria-hidden />
              )}
            </button>
          )}
        </div>
      }
    />
  )
}
