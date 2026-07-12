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
  const res = await fetch('/api/points', { credentials: 'include' })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json() as Promise<PointsStats>
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
  const res = await fetch('/api/points/stats', { credentials: 'include' })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json() as Promise<UserStats>
}
