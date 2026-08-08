import { apiRequest } from './api'
import type { TaskComplexity } from './tasks'

/** Shape of GET /api/points (issue #28). */
export type PointsStats = {
  total: number
  today: {
    date: string
    tasksCompleted: number
    pointsEarned: number
    /** Multiplier the next completion will earn — shown live in the flow. */
    currentMultiplier: number
  }
  basePoints: Record<TaskComplexity, number>
  /** Speed-bonus config (#262) — served from PointsConfig for the task view's
   * forecast panel; bonus caps at `maxRatio`×base when finishing within
   * `saturation`×estimate. */
  speedBonus: { maxRatio: number; saturation: number }
  /** Fair-play limits (#383) — served from PointsConfig so the "How points
   * work" page (#385) never hardcodes a number. estimateBands: per-complexity
   * [min, max] minutes the scoring math trusts. */
  limits: {
    estimateBands: Record<TaskComplexity, [number, number]>
    minScoringMinutes: number
    dailyBudgetMinutes: number
    dailyCompletionsCap: number
    projectBonus: { ratio: number; min: number; max: number; minTasks: number }
  }
}

export async function fetchPoints(): Promise<PointsStats> {
  return apiRequest<PointsStats>('/points')
}

/** Shape of GET /api/points/stats (issue #38 user page). */
export type UserStats = {
  total: number
  lifetime: { tasksCompleted: number; speedBonusTotal: number }
  today: {
    date: string
    tasksCompleted: number
    pointsEarned: number
    currentMultiplier: number
  }
  streak: { currentDays: number }
  /** Multiplier config (#260) — served from PointsConfig so the right-column
   * progress track never hardcodes points numbers client-side. */
  multiplier: { cap: number; capTaskNumber: number }
}

export async function fetchUserStats(): Promise<UserStats> {
  return apiRequest<UserStats>('/points/stats')
}
