import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Layers, Mountain, Play, Zap } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Mascot } from '@/components/Mascot'
import { useInProgress } from '@/inprogress/useInProgress'
import { fetchCategories, type Category } from '@/lib/categories'
import { projectTint } from '@/lib/projectColors'
import { type WinSize } from '@/lib/tasks'
import { fetchTaskAvailability, type TaskAvailability } from '@/lib/tasks'

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
 * Time presets folded INTO the win-type rows (#324 review round): the old
 * standalone "How much time do you have?" section overlapped with the win-type
 * question ("small tasks" ≈ "a little time"), so each row now carries the
 * presets that fit its promise — short windows on the small row, long/open on
 * the big row. Labels stay fuzzy (2.3.0 review); each still maps to a minute
 * cap for the server's unchanged `minutes` filter (null = any).
 */
const SMALL_TIMES: { label: string; minutes: number | null }[] = [
  { label: 'A little time', minutes: 30 },
  { label: 'A few hours', minutes: 180 },
]
const BIG_TIMES: { label: string; minutes: number | null }[] = [
  { label: 'A day', minutes: 480 },
  { label: 'Any time', minutes: null },
]

/**
 * Play-mode choice screen (issue #30, restructured in the #324 review rounds):
 * a category FILTER chip row sits under the heading (round 3 — "Any category"
 * default; a picked category scopes whichever option launches below, the
 * option rows never change), then every option row is a launcher — the
 * small/big rows launch via their embedded time chips, "Focus on projects" is
 * a whole-row auto-pick. The picked filters ride URL params into the
 * task-presented screen (#31), so the pick stays shareable/reloadable.
 */
export function Choice() {
  const navigate = useNavigate()
  const { activeTask } = useInProgress()
  const [heading] = useState(() => HEADINGS[Math.floor(Math.random() * HEADINGS.length)])

  // #306: hide options with zero possible candidates (at ANY time — the time
  // filter is deliberately not part of this). While loading, render all rows
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

  // Category filter (#324, round 3): a chip row under the heading scoping any
  // option below; renders only when the user actually has categories
  // (best-effort fetch — a failure just hides the filter).
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

  function go(size: WinSize, minutes: number | null) {
    const params = new URLSearchParams({ size })
    if (minutes != null) params.set('minutes', String(minutes))
    if (category != null) params.set('category', String(category))
    navigate(`/play/task?${params.toString()}`)
  }

  // "Focus on projects" (#238): a mode, not a size — the server auto-picks the
  // project closest to done. The category filter carries.
  function goProjects() {
    const params = new URLSearchParams({ mode: 'projects' })
    if (category != null) params.set('category', String(category))
    navigate(`/play/task?${params.toString()}`)
  }

  // Roving-tabindex radiogroup for the filter chips (A11Y-5, #126): only the
  // checked chip is tabbable; arrow keys move selection AND focus together.
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])
  function onChipKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = categories.length
    let next = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else return
    e.preventDefault()
    setCategory(next === 0 ? null : categories[next - 1].id)
    chipRefs.current[next]?.focus()
  }

  const showSmall = avail?.small ?? true
  const showBig = avail?.big ?? true
  const showProjects = avail?.projects ?? true

  // #306: with nothing to offer at all (empty backlog), the choice card gives
  // way to the shared nothing-here treatment instead of dead options. (small
  // and big together cover every complexity, so both false = empty backlog —
  // the category row could not produce a task either.) No re-pick link — it
  // would loop straight back here.
  if (avail !== null && !showSmall && !showBig && !showProjects) {
    return <EmptyState repick={false} />
  }

  // Launch chips are deliberately SMALL (review round 2): the time pair sits
  // right-aligned in its row (the Auto-picked pill's slot) so the small/big
  // rows keep the same visual height as "Focus on projects"; the tap-44 halo
  // keeps the touch target honest.
  const chipClass =
    'tap-44 h-7 rounded-lg bg-surface px-2.5 text-xs text-gray-700 transition hover:bg-field'

  return (
    // #264 (epic #256 D): one prototype-style choice card — mascot half-out on
    // top, full-width option rows. Solo mode (the shell hides rail/column/
    // search), so the card is the whole stage.
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

        {/* Category filter (#324, round 3): in essence a filter, so it sits
            with the heading, not among the options — "Any category" default,
            a picked category scopes whichever option launches below. Chips
            wear their category's palette tint (#336's Dashboard-chip
            treatment); the selected one deepens the tint. */}
        {categories.length > 0 && (
          <div
            role="radiogroup"
            aria-label="Category filter"
            className="-mt-2 mb-5 flex flex-wrap justify-center gap-1.5"
          >
            {[null, ...categories.map((c) => c.id)].map((id, i) => {
              const active = category === id
              const cat = id === null ? null : categories[i - 1]
              return (
                <button
                  key={id ?? 'any'}
                  ref={(el) => {
                    chipRefs.current[i] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setCategory(id)}
                  onKeyDown={(e) => onChipKeyDown(e, i)}
                  className={`tap-44 h-7 max-w-40 truncate rounded-lg px-2.5 text-xs transition ${
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
                  {cat === null ? 'Any category' : cat.name}
                </button>
              )
            })}
          </div>
        )}

        {showSmall && (
          <div className="mb-2 flex w-full items-center gap-4 rounded-xl bg-page/70 p-3.5">
            <span className="flex w-9 shrink-0 justify-center">
              <Zap className="h-7 w-7 text-success" fill="currentColor" strokeWidth={0} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-gray-800">
                Get small tasks done
              </span>
              <span className="mt-0.5 block text-xs text-muted">A quick, low-effort win</span>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {SMALL_TIMES.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => go('small', opt.minutes)}
                  className={chipClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {showBig && (
          <div className="mb-2 flex w-full items-center gap-4 rounded-xl bg-page/70 p-3.5">
            <span className="flex w-9 shrink-0 justify-center">
              <Mountain className="h-7 w-7 text-primary" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-gray-800">
                Take on bigger issues
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Real progress, worth more points
              </span>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {BIG_TIMES.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => go('big', opt.minutes)}
                  className={chipClass}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Third path (#238): a MODE, not a size — whole-row tap, the server
            auto-picks. */}
        {showProjects && (
          <button
            type="button"
            onClick={goProjects}
            className="flex w-full items-center gap-4 rounded-xl bg-page/70 p-3.5 text-left transition hover:bg-field"
          >
            <span className="flex w-9 shrink-0 justify-center">
              <Layers className="h-7 w-7 text-accent" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-gray-800">
                Focus on projects
              </span>
              <span className="mt-0.5 block text-xs text-muted">The project closest to done</span>
            </span>
            <span className="shrink-0 rounded-full bg-accent-tint px-2.5 py-0.5 text-[11px] font-semibold text-accent-ink">
              Auto-picked
            </span>
          </button>
        )}

      </div>
    </main>
  )
}
