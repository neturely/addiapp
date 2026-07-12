import type { Task } from '../db/schema.js'

/**
 * Task-selection strategies for Play mode (issue #31).
 *
 * A strategy takes an ALREADY-FILTERED list of candidate tasks (the route has
 * applied the win-type / time-available / exclude filters) and returns the ONE
 * task to present, or null when nothing matches. Keeping the choice behind this
 * interface is deliberate: the plan is to let a user pick their own strategy
 * from a settings page later, which then becomes "look up the user's preference
 * and call `strategies[name]`" — a small change, not a rewrite. No plugin system,
 * just a clear seam so the algorithm never gets inlined into the route handler.
 *
 * `rng` is injectable so the randomised strategies are deterministic in tests.
 */
export type SelectionStrategy = (candidates: Task[], rng?: () => number) => Task | null

/** Oldest first, then lowest id — stable even when timestamps collide (bulk-created tasks). */
function byAgeThenId(a: Task, b: Task): number {
  const at = a.createdAt.getTime()
  const bt = b.createdAt.getTime()
  return at !== bt ? at - bt : a.id - b.id
}

/**
 * Default strategy: weighted random that favours older tasks.
 *
 * Why this one for the gamified "keep momentum" loop:
 * - Pure random re-offers freely and lets tasks rot at the bottom of the backlog.
 * - Strict oldest-first is predictable — "give me something else" would just walk
 *   the list in order, which reads as a to-do list, not a mascot surprising you.
 * - Weighting toward older keeps anything from stagnating (the oldest task is the
 *   most likely pick) while staying random, so a re-roll still feels fresh. That
 *   combination — nothing forgotten + a bit of slot-machine variety — is what the
 *   single-task guided flow is going for.
 *
 * Weights are rank-based (oldest = n … newest = 1), so the function is pure — it
 * needs no notion of "now" and is trivially testable with a fixed rng.
 */
export const weightedByAge: SelectionStrategy = (candidates, rng = Math.random) => {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const ordered = [...candidates].sort(byAgeThenId)
  const n = ordered.length
  const weights = ordered.map((_, i) => n - i) // oldest heaviest, strictly decreasing
  const total = (n * (n + 1)) / 2

  let r = rng() * total
  for (let i = 0; i < n; i++) {
    r -= weights[i]
    if (r < 0) return ordered[i]
  }
  return ordered[n - 1] // rng() === 1 fallback (spec says [0,1), but be safe)
}

/** Deterministic: always the oldest matching task. */
export const oldestFirst: SelectionStrategy = (candidates) =>
  candidates.length ? [...candidates].sort(byAgeThenId)[0] : null

/** Uniform random among matches. */
export const uniformRandom: SelectionStrategy = (candidates, rng = Math.random) =>
  candidates.length ? candidates[Math.floor(rng() * candidates.length)]! : null

export const strategies = { weightedByAge, oldestFirst, uniformRandom } as const
export type StrategyName = keyof typeof strategies

/**
 * The active strategy. Swapping this line (or, later, selecting by
 * `strategies[user.selectionStrategy]`) changes selection app-wide without
 * touching the route.
 */
export const defaultStrategy: SelectionStrategy = weightedByAge
