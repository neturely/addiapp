import { useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layers, Mountain, Play, Zap } from 'lucide-react'
import { Mascot } from '@/components/Mascot'
import { useInProgress } from '@/inprogress/useInProgress'
import type { WinSize } from '@/lib/tasks'

/** Time-available presets (minutes). null = "any amount of time". */
const TIME_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'Any time', minutes: null },
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
]

/** Rotating heading (#183) — a random one is picked per mount. */
const HEADINGS = [
  'What kind of win do you want?',
  'Ready for something?',
  'Where should we start?',
  "What's the move?",
  "Let's pick a win",
  'What sounds good?',
  'Time to choose',
  "What's calling you?",
  'Pick your challenge',
  "What'll it be?",
]

/**
 * Play-mode choice screen (issue #30): "What kind of win do you want?" plus a
 * time-available filter. Picking a win type carries both selections into the
 * task-presented screen (#31) as URL params, so the pick is shareable/reloadable.
 */
export function Choice() {
  const navigate = useNavigate()
  const { activeTask } = useInProgress()
  const [minutes, setMinutes] = useState<number | null>(null)
  const [heading] = useState(() => HEADINGS[Math.floor(Math.random() * HEADINGS.length)])

  function go(size: WinSize) {
    const params = new URLSearchParams({ size })
    if (minutes != null) params.set('minutes', String(minutes))
    navigate(`/play/task?${params.toString()}`)
  }

  // "Focus on projects" (#238): a mode, not a size — win-type is ignored, the
  // server auto-picks the project closest to done. Only the time filter carries.
  function goProjects() {
    const params = new URLSearchParams({ mode: 'projects' })
    if (minutes != null) params.set('minutes', String(minutes))
    navigate(`/play/task?${params.toString()}`)
  }

  // Roving-tabindex radiogroup for the time presets (A11Y-5, #126): only the
  // checked pill is tabbable; arrow keys move the selection AND focus together,
  // matching the WAI-ARIA radio pattern.
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([])
  function onPillKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TIME_OPTIONS.length - 1
    let next = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else return
    e.preventDefault()
    setMinutes(TIME_OPTIONS[next].minutes)
    pillRefs.current[next]?.focus()
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="text-2xl font-bold text-gray-800">{heading}</h1>

      {/* Resume banner (#183 follow-up): a task mid-flight is surfaced here too,
          not only in the header chip — the step towards Choice-as-home. */}
      {activeTask && (
        <Link
          to={`/play/progress/${activeTask.id}`}
          className="flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-accent-tint px-6 py-3 font-semibold text-accent-ink transition hover:opacity-90"
        >
          <Play className="h-4 w-4 shrink-0" fill="currentColor" strokeWidth={0} aria-hidden />
          Resume: <span className="max-w-[16rem] truncate">{activeTask.title}</span>
        </Link>
      )}

      {/* Two equal paths flanking the mascot on sm+ (small left / big right); on
          narrow widths (app uses `sm`, not `md`) they stack full-width UNDER the
          mascot. Each card is a compact horizontal row on mobile (badge left,
          text right) and a centred column on sm+ (#183). Colour lives on the icon
          badge; cards stay white/equal-weight; mascot keeps its real colour. */}
      <div className="flex w-full max-w-2xl flex-col gap-3">
        {/* Two win-type paths flank the mascot on sm+; below sm they stack. */}
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:gap-5">
          <button
            type="button"
            onClick={() => go('small')}
            className="order-2 flex flex-1 cursor-pointer items-center gap-3 rounded-2xl bg-surface p-4 text-left transition hover:bg-success-tint sm:order-1 sm:flex-col sm:justify-center sm:gap-2 sm:p-5 sm:text-center"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success">
              <Zap className="h-6 w-6 text-white" fill="currentColor" strokeWidth={0} aria-hidden />
            </span>
            <div>
              <div className="text-lg font-bold text-success-ink">Get small tasks done</div>
              <div className="text-sm text-muted">A quick, low-effort win</div>
            </div>
          </button>

          <Mascot
            expression="neutral"
            className="order-1 h-20 w-20 shrink-0 self-center sm:order-2 sm:h-24 sm:w-24"
          />

          <button
            type="button"
            onClick={() => go('big')}
            className="order-3 flex flex-1 cursor-pointer items-center gap-3 rounded-2xl bg-surface p-4 text-left transition hover:bg-primary-tint sm:order-3 sm:flex-col sm:justify-center sm:gap-2 sm:p-5 sm:text-center"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary">
              <Mountain className="h-6 w-6 text-white" strokeWidth={2.5} aria-hidden />
            </span>
            <div>
              <div className="text-lg font-bold text-primary-ink">Take on bigger issues</div>
              <div className="text-sm text-muted">Real progress worth more points</div>
            </div>
          </button>
        </div>

        {/* Third path (#238): a MODE, not a size — full-width, auto-picked, no
            project picker. Win-type doesn't apply; only the time filter carries. */}
        <button
          type="button"
          onClick={goProjects}
          className="flex cursor-pointer items-center gap-3 rounded-2xl bg-surface p-4 text-left transition hover:bg-accent-tint sm:p-5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent">
            <Layers className="h-6 w-6 text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-accent-ink">Focus on projects</span>
              <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent-ink ring-1 ring-inset ring-accent/40">
                Auto-picked
              </span>
            </div>
            <div className="text-sm text-muted">We’ll pick the project closest to done</div>
          </div>
        </button>
      </div>

      <div className="w-full max-w-md">
        <p id="time-label" className="mb-2 text-sm font-medium text-muted">
          How much time do you have?
        </p>
        <div
          role="radiogroup"
          aria-labelledby="time-label"
          className="flex flex-wrap justify-center gap-2"
        >
          {TIME_OPTIONS.map((opt, i) => {
            const active = minutes === opt.minutes
            return (
              <button
                key={opt.label}
                ref={(el) => {
                  pillRefs.current[i] = el
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setMinutes(opt.minutes)}
                onKeyDown={(e) => onPillKeyDown(e, i)}
                className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface text-muted hover:bg-primary-tint'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </main>
  )
}
