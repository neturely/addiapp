import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Layers, Mountain, Play, Zap } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Mascot } from '@/components/Mascot'
import { useInProgress } from '@/inprogress/useInProgress'
import { fetchCategories, type Category } from '@/lib/categories'
import { projectTint } from '@/lib/projectColors'
import { fetchTaskAvailability, type TaskAvailability, type WinSize } from '@/lib/tasks'

/** Time-available presets (2.3.0 review round: fuzzy durations, not concrete
 *  minutes — labels only; each still maps to a minute cap for the server's
 *  unchanged `minutes` filter). null = "any amount of time". */
const TIME_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'Any time', minutes: null },
  { label: 'A little time', minutes: 30 },
  { label: 'A few hours', minutes: 180 },
  { label: 'A day', minutes: 480 },
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

  // #306: hide options with zero possible candidates (at ANY time — the time
  // filter is deliberately not part of this). While loading, render all three
  // as before: no pop-in for the common all-available case, and a dead-end
  // click during that window still lands on the #32 empty state.
  const [avail, setAvail] = useState<TaskAvailability | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchTaskAvailability()
      .then((a) => {
        if (!cancelled) setAvail(a)
      })
      .catch(() => {}) // best-effort: on failure keep showing every option
    return () => {
      cancelled = true
    }
  }, [])

  // Category filter (#276): scope any option's pick to one custom list. The
  // select renders only when the user actually has categories (best-effort
  // fetch — a failure just hides the filter).
  const [categories, setCategories] = useState<Category[]>([])
  const [category, setCategory] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchCategories()
      .then((c) => {
        if (!cancelled) setCategories(c)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function go(size: WinSize) {
    const params = new URLSearchParams({ size })
    if (minutes != null) params.set('minutes', String(minutes))
    if (category != null) params.set('category', String(category))
    navigate(`/play/task?${params.toString()}`)
  }

  // "Focus on projects" (#238): a mode, not a size — win-type is ignored, the
  // server auto-picks the project closest to done. Time + category carry.
  function goProjects() {
    const params = new URLSearchParams({ mode: 'projects' })
    if (minutes != null) params.set('minutes', String(minutes))
    if (category != null) params.set('category', String(category))
    navigate(`/play/task?${params.toString()}`)
  }

  // Roving-tabindex radiogroups (A11Y-5, #126): only the checked pill is
  // tabbable; arrow keys move the selection AND focus together, matching the
  // WAI-ARIA radio pattern. `rove` resolves the target index; each row applies
  // its own selection + focus.
  function rove(e: KeyboardEvent<HTMLButtonElement>, index: number, last: number): number | null {
    let next = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else return null
    e.preventDefault()
    return next
  }

  const pillRefs = useRef<(HTMLButtonElement | null)[]>([])
  function onPillKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rove(e, index, TIME_OPTIONS.length - 1)
    if (next === null) return
    setMinutes(TIME_OPTIONS[next].minutes)
    pillRefs.current[next]?.focus()
  }

  // #324: the category chips are their own radiogroup — index 0 = "Anything"
  // (no filter), then one chip per category.
  const categoryRefs = useRef<(HTMLButtonElement | null)[]>([])
  function onCategoryKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rove(e, index, categories.length)
    if (next === null) return
    setCategory(next === 0 ? null : categories[next - 1].id)
    categoryRefs.current[next]?.focus()
  }

  const showSmall = avail?.small ?? true
  const showBig = avail?.big ?? true
  const showProjects = avail?.projects ?? true

  // #306: with nothing to offer at all (empty backlog), the choice card gives
  // way to the shared nothing-here treatment instead of three dead options.
  // No re-pick link — it would loop straight back here.
  if (avail !== null && !showSmall && !showBig && !showProjects) {
    return <EmptyState repick={false} />
  }

  return (
    // #264 (epic #256 D): one prototype-style choice card — mascot half-out on
    // top, three full-width option rows, time chips inside the card. Solo mode
    // (the shell hides rail/column/search), so the card is the whole stage.
    <main className="flex min-h-screen flex-col items-center justify-center p-5 pt-14">
      <div className="relative w-full max-w-lg rounded-card bg-surface px-5 pb-6 pt-14 sm:px-7">
        <div className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2">
          <Mascot expression="neutral" halo className="h-[5.5rem] w-[5.5rem]" />
        </div>

        {/* Resume banner (#183 follow-up): a task mid-flight is surfaced here
            too, not only in the header chip. */}
        {activeTask && (
          <Link
            to={`/play/progress/${activeTask.id}`}
            className="mb-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-tint px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90 sm:min-h-0"
          >
            <Play className="h-4 w-4 shrink-0" fill="currentColor" strokeWidth={0} aria-hidden />
            Resume: <span className="max-w-[14rem] truncate">{activeTask.title}</span>
          </Link>
        )}

        <h1 className="mb-5 text-center text-xl font-bold tracking-tight text-gray-800">
          {heading}
        </h1>

        {/* Category picker (#324 — promotes the old #276 "From inside of"
            select to a first-class chip row, context before win type; only
            when custom lists exist). Chips wear their category's palette tint
            (#336's Dashboard-chip treatment); the selected one deepens the
            tint. "Anything" keeps the default unscoped pick. */}
        {categories.length > 0 && (
          <>
            <p id="category-label" className="mb-2.5 text-center text-xs text-muted">
              What are you working from?
            </p>
            <div
              role="radiogroup"
              aria-labelledby="category-label"
              className="mb-5 flex flex-wrap justify-center gap-1.5"
            >
              {[null, ...categories.map((c) => c.id)].map((id, i) => {
                const active = category === id
                const cat = id === null ? null : categories[i - 1]
                return (
                  <button
                    key={id ?? 'any'}
                    ref={(el) => {
                      categoryRefs.current[i] = el
                    }}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setCategory(id)}
                    onKeyDown={(e) => onCategoryKeyDown(e, i)}
                    className={`tap-44 h-8 max-w-40 cursor-pointer truncate rounded-lg px-3.5 text-[13px] transition ${
                      cat === null
                        ? active
                          ? 'bg-primary-deep font-semibold text-white'
                          : 'bg-page/70 text-gray-700 hover:bg-field'
                        : active
                          ? 'font-semibold text-gray-900'
                          : 'font-medium text-gray-700'
                    }`}
                    style={
                      cat === null
                        ? undefined
                        : { backgroundColor: projectTint(cat.color, active ? 45 : 18) }
                    }
                  >
                    {cat === null ? 'Anything' : cat.name}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {showSmall && (
        <button
          type="button"
          onClick={() => go('small')}
          className="mb-2 flex w-full cursor-pointer items-center gap-4 rounded-xl bg-page/70 p-3.5 text-left transition hover:bg-field"
        >
          <span className="flex w-9 shrink-0 justify-center">
            <Zap className="h-7 w-7 text-success" fill="currentColor" strokeWidth={0} aria-hidden />
          </span>
          <span>
            <span className="block text-[15px] font-semibold text-gray-800">
              Get small tasks done
            </span>
            <span className="mt-0.5 block text-xs text-muted">A quick, low-effort win</span>
          </span>
        </button>
        )}

        {showBig && (
        <button
          type="button"
          onClick={() => go('big')}
          className="mb-2 flex w-full cursor-pointer items-center gap-4 rounded-xl bg-page/70 p-3.5 text-left transition hover:bg-field"
        >
          <span className="flex w-9 shrink-0 justify-center">
            <Mountain className="h-7 w-7 text-primary" strokeWidth={2.25} aria-hidden />
          </span>
          <span>
            <span className="block text-[15px] font-semibold text-gray-800">
              Take on bigger issues
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              Real progress, worth more points
            </span>
          </span>
        </button>
        )}

        {/* Third path (#238): a MODE, not a size — win-type is ignored, only the
            time filter carries. */}
        {showProjects && (
        <button
          type="button"
          onClick={goProjects}
          className="flex w-full cursor-pointer items-center gap-4 rounded-xl bg-page/70 p-3.5 text-left transition hover:bg-field"
        >
          <span className="flex w-9 shrink-0 justify-center">
            <Layers className="h-7 w-7 text-accent" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-gray-800">Focus on projects</span>
            <span className="mt-0.5 block text-xs text-muted">The project closest to done</span>
          </span>
          <span className="shrink-0 rounded-full bg-accent-tint px-2.5 py-0.5 text-[11px] font-semibold text-accent-ink">
            Auto-picked
          </span>
        </button>
        )}

        <p id="time-label" className="mb-2.5 mt-5 text-center text-xs text-muted">
          How much time do you have?
        </p>
        <div
          role="radiogroup"
          aria-labelledby="time-label"
          className="flex flex-wrap justify-center gap-1.5"
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
                className={`tap-44 h-8 cursor-pointer rounded-lg px-3.5 text-[13px] transition ${
                  active
                    ? 'bg-primary-deep font-semibold text-white'
                    : 'bg-page/70 text-gray-700 hover:bg-field'
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
