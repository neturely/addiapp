import { useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '@/components/Mascot'
import type { WinSize } from '@/lib/tasks'

/** Time-available presets (minutes). null = "any amount of time". */
const TIME_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'Any time', minutes: null },
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
]

/**
 * Play-mode choice screen (issue #30): "What kind of win do you want?" plus a
 * time-available filter. Picking a win type carries both selections into the
 * task-presented screen (#31) as URL params, so the pick is shareable/reloadable.
 */
export function Choice() {
  const navigate = useNavigate()
  const [minutes, setMinutes] = useState<number | null>(null)

  function go(size: WinSize) {
    const params = new URLSearchParams({ size })
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
      <h1 className="text-2xl font-bold text-gray-800">What kind of win do you want?</h1>

      {/* The mascot presents two equal paths — small (left) / big (right). */}
      <div className="flex w-full max-w-2xl items-stretch justify-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={() => go('small')}
          className="flex flex-1 flex-col justify-center rounded-2xl bg-surface p-5 transition hover:bg-success-tint"
        >
          <div className="text-lg font-bold text-success-ink">Something small</div>
          <div className="mt-1 text-sm text-muted">A quick, low-effort win</div>
        </button>

        <Mascot expression="neutral" className="h-20 w-20 shrink-0 self-center sm:h-24 sm:w-24" />

        <button
          type="button"
          onClick={() => go('big')}
          className="flex flex-1 flex-col justify-center rounded-2xl bg-surface p-5 transition hover:bg-primary-tint"
        >
          <div className="text-lg font-bold text-primary-ink">Something big</div>
          <div className="mt-1 text-sm text-muted">Real progress worth more points</div>
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
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-primary-tint'
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
