import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { pointsLog, dailyStats, type Task } from '../db/schema.js'
import { APP_TIMEZONE, BASE_POINTS } from './config.js'
import { basePointsFor, computeSpeedBonus, computeTotal, dailyMultiplier } from './calculate.js'

/** Current calendar date (YYYY-MM-DD) in the configured timezone. */
function todayInTz(): string {
  // en-CA formats as ISO date (YYYY-MM-DD)
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date())
}

export type AwardResult = {
  basePoints: number
  speedBonus: number
  multiplier: number
  totalPoints: number
}

/**
 * Awards points for a completed task. Idempotent per task — a task earns points
 * exactly once (its first completion), so re-opening + re-completing does not
 * double-award. Returns the breakdown, or null if already awarded.
 */
export async function awardTaskCompletion(task: Task): Promise<AwardResult | null> {
  const already = await db
    .select({ id: pointsLog.id })
    .from(pointsLog)
    .where(eq(pointsLog.taskId, task.id))
    .limit(1)
  if (already.length > 0) return null

  const basePoints = basePointsFor(task.complexity)
  const speedBonus = computeSpeedBonus(basePoints, task.estimatedMinutes, task.actualMinutes)

  const today = todayInTz()
  const stat = await db
    .select({ tasksCompleted: dailyStats.tasksCompleted })
    .from(dailyStats)
    .where(and(eq(dailyStats.userId, task.userId), eq(dailyStats.statDate, today)))
    .limit(1)
  const priorCount = stat[0]?.tasksCompleted ?? 0
  const n = priorCount + 1

  const multiplier = dailyMultiplier(n)
  const totalPoints = computeTotal(basePoints, speedBonus, multiplier)
  // What the *next* completion would earn — the live value shown in the UI.
  const liveMultiplier = dailyMultiplier(n + 1)

  await db.insert(pointsLog).values({
    userId: task.userId,
    taskId: task.id,
    basePoints,
    speedBonus,
    multiplier: multiplier.toFixed(2),
    totalPoints,
  })

  await db
    .insert(dailyStats)
    .values({
      userId: task.userId,
      statDate: today,
      tasksCompleted: 1,
      pointsEarned: totalPoints,
      multiplier: liveMultiplier.toFixed(2),
    })
    .onDuplicateKeyUpdate({
      set: {
        tasksCompleted: sql`${dailyStats.tasksCompleted} + 1`,
        pointsEarned: sql`${dailyStats.pointsEarned} + ${totalPoints}`,
        multiplier: liveMultiplier.toFixed(2),
      },
    })

  return { basePoints, speedBonus, multiplier, totalPoints }
}

export type PointsStats = {
  total: number
  today: {
    date: string
    tasksCompleted: number
    pointsEarned: number
    currentMultiplier: number
  }
  basePoints: typeof BASE_POINTS
}

/** Everything the dashboard card / user page / task-presented screen need. */
export async function getPointsStats(userId: number): Promise<PointsStats> {
  const totalRow = await db
    .select({ total: sql<string>`COALESCE(SUM(${pointsLog.totalPoints}), 0)` })
    .from(pointsLog)
    .where(eq(pointsLog.userId, userId))
  const total = Number(totalRow[0]?.total ?? 0)

  const today = todayInTz()
  const stat = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.userId, userId), eq(dailyStats.statDate, today)))
    .limit(1)
  const tasksCompleted = stat[0]?.tasksCompleted ?? 0
  const pointsEarned = stat[0]?.pointsEarned ?? 0

  return {
    total,
    today: {
      date: today,
      tasksCompleted,
      pointsEarned,
      // Live multiplier the next completion will earn.
      currentMultiplier: dailyMultiplier(tasksCompleted + 1),
    },
    basePoints: BASE_POINTS,
  }
}
