import type { Task } from '../db/schema.js'
import {
  BASE_POINTS,
  SPEED_BONUS_MAX_RATIO,
  SPEED_BONUS_SATURATION,
  DAILY_MULTIPLIER_GROWTH,
  DAILY_MULTIPLIER_CAP,
} from './config.js'

/** Pure gamification math — no DB, no side effects. Easy to unit-test. */

export function basePointsFor(complexity: Task['complexity']): number {
  return BASE_POINTS[complexity]
}

/**
 * Speed bonus in points. 0 unless the task was finished faster than estimated.
 * Scales with the fraction of time saved, reaching the ceiling at
 * SPEED_BONUS_SATURATION and going no higher (anti-gaming).
 */
export function computeSpeedBonus(
  basePoints: number,
  estimatedMinutes: number,
  actualMinutes: number | null,
): number {
  if (actualMinutes === null || estimatedMinutes <= 0 || actualMinutes >= estimatedMinutes) {
    return 0
  }
  const saved = Math.min(Math.max((estimatedMinutes - actualMinutes) / estimatedMinutes, 0), 1)
  const effective = Math.min(saved / SPEED_BONUS_SATURATION, 1)
  return Math.round(basePoints * SPEED_BONUS_MAX_RATIO * effective)
}

/**
 * Multiplier applied to the n-th completed task of the day (n is 1-based).
 * Rounded to 2 decimals so it matches the stored/displayed value and avoids
 * float drift (e.g. 1 + 3*0.15 = 1.44999… would round a total down incorrectly).
 */
export function dailyMultiplier(n: number): number {
  const raw = 1 + Math.max(0, n - 1) * DAILY_MULTIPLIER_GROWTH
  return Math.min(Math.round(raw * 100) / 100, DAILY_MULTIPLIER_CAP)
}

/** Rounded total points for one completion. */
export function computeTotal(basePoints: number, speedBonus: number, multiplier: number): number {
  return Math.round((basePoints + speedBonus) * multiplier)
}
