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

/** True for a MySQL duplicate-key (unique constraint) violation. */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY'
  )
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

  // The UNIQUE(task_id) constraint (issue #74) is the real idempotency gate: the
  // pre-check above is only a fast path. Under a concurrent double-complete this
  // insert atomically picks the single winner — a duplicate-key means another
  // request already awarded this task, so bail before touching daily stats.
  try {
    await db.insert(pointsLog).values({
      userId: task.userId,
      taskId: task.id,
      basePoints,
      speedBonus,
      multiplier: multiplier.toFixed(2),
      totalPoints,
    })
  } catch (err) {
    if (isDuplicateKeyError(err)) return null
    throw err
  }

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

/** Previous calendar date (YYYY-MM-DD) — dates are plain, so UTC-midnight math is safe. */
function prevDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export type UserStats = {
  total: number
  lifetime: { tasksCompleted: number; speedBonusTotal: number }
  today: { date: string; tasksCompleted: number; pointsEarned: number; currentMultiplier: number }
  /** Consecutive days (in APP_TIMEZONE) with ≥1 completion, counting back from today. */
  streak: { currentDays: number }
}

/**
 * Richer points/stats for the dedicated user stats page (issue #38). Kept separate
 * from getPointsStats so the frequently-refreshed dashboard card stays lean.
 */
export async function getUserStats(userId: number): Promise<UserStats> {
  const agg = await db
    .select({
      total: sql<string>`COALESCE(SUM(${pointsLog.totalPoints}), 0)`,
      tasks: sql<string>`COUNT(*)`,
      speed: sql<string>`COALESCE(SUM(${pointsLog.speedBonus}), 0)`,
    })
    .from(pointsLog)
    .where(eq(pointsLog.userId, userId))
  const total = Number(agg[0]?.total ?? 0)
  const lifetimeTasks = Number(agg[0]?.tasks ?? 0)
  const speedBonusTotal = Number(agg[0]?.speed ?? 0)

  const today = todayInTz()
  const todayRow = await db
    .select()
    .from(dailyStats)
    .where(and(eq(dailyStats.userId, userId), eq(dailyStats.statDate, today)))
    .limit(1)
  const tasksCompleted = todayRow[0]?.tasksCompleted ?? 0
  const pointsEarned = todayRow[0]?.pointsEarned ?? 0

  // Streak: walk back day-by-day over the set of active dates. If today has no
  // completion yet, start from yesterday so a fresh day doesn't zero the streak.
  const dayRows = await db
    .select({ statDate: dailyStats.statDate, tasksCompleted: dailyStats.tasksCompleted })
    .from(dailyStats)
    .where(eq(dailyStats.userId, userId))
  const activeDays = new Set(dayRows.filter((r) => r.tasksCompleted > 0).map((r) => r.statDate))
  let cursor = activeDays.has(today) ? today : prevDate(today)
  let currentDays = 0
  while (activeDays.has(cursor)) {
    currentDays += 1
    cursor = prevDate(cursor)
  }

  return {
    total,
    lifetime: { tasksCompleted: lifetimeTasks, speedBonusTotal },
    today: {
      date: today,
      tasksCompleted,
      pointsEarned,
      currentMultiplier: dailyMultiplier(tasksCompleted + 1),
    },
    streak: { currentDays },
  }
}
