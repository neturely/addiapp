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
}

export async function fetchUserStats(): Promise<UserStats> {
  return apiRequest<UserStats>('/points/stats')
}
