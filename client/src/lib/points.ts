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
