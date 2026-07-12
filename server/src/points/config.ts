import 'dotenv/config'
import type { Task } from '../db/schema.js'

/**
 * Tunable points constants (PROJECT_SPEC §7, owner-confirmed #28). These are the
 * ONLY place the gamification numbers live — tuning them after real usage never
 * touches the calculation logic in ./calculate.ts.
 */

/** Base points by task complexity. */
export const BASE_POINTS: Record<Task['complexity'], number> = {
  low: 2,
  medium: 5,
  high: 10,
}

/**
 * Speed bonus: rewards finishing faster than estimated, scaled to time saved.
 * - SPEED_BONUS_MAX_RATIO — ceiling as a fraction of base points (1.0 = up to +100%,
 *   i.e. a fast task can at most double its base value).
 * - SPEED_BONUS_SATURATION — time-saved fraction at which the ceiling is reached
 *   (0.5 = finishing in half the estimate). No extra reward beyond this, so a wild
 *   underestimate can't farm points.
 */
export const SPEED_BONUS_MAX_RATIO = 1.0
export const SPEED_BONUS_SATURATION = 0.5

/**
 * Daily multiplier: grows per task completed that day, capped, resets at midnight.
 * multiplier(n) = min(1 + (n-1) * GROWTH, CAP). +0.15/task, cap 2.0 → the cap is
 * reached at the 8th task of the day.
 */
export const DAILY_MULTIPLIER_GROWTH = 0.15
export const DAILY_MULTIPLIER_CAP = 2.0

/** Timezone whose midnight resets the daily multiplier (owner is in Sweden). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Europe/Stockholm'
