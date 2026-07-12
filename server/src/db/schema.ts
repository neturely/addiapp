import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  timestamp,
  date,
  decimal,
  boolean,
  unique,
} from 'drizzle-orm/mysql-core'

/**
 * Task complexity → base points are assigned in the points logic (issue #28):
 * low = 2, medium = 5, high = 10. Stored here only as the classification.
 */
export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
})

/**
 * Single-use, time-limited tokens for email flows (issue #61/#62). `type`
 * distinguishes email verification from password reset. The token itself is the
 * opaque value placed in the emailed link.
 */
export const emailTokens = mysqlTable('email_tokens', {
  token: varchar('token', { length: 64 }).primaryKey(),
  userId: int('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: mysqlEnum('type', ['verify', 'reset']).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

/**
 * Server-side sessions (issue #26). `id` is an opaque random token stored in an
 * httpOnly cookie; the row is the source of truth so logout/expiry revoke access
 * immediately.
 */
export const sessions = mysqlTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: int('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const tasks = mysqlTable('tasks', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  complexity: mysqlEnum('complexity', ['low', 'medium', 'high']).notNull(),
  estimatedMinutes: int('estimated_minutes').notNull(),
  status: mysqlEnum('status', ['backlog', 'in_progress', 'done']).default('backlog').notNull(),
  // Timing captured for the speed bonus (issue #28): set on Start / on completion.
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  actualMinutes: int('actual_minutes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
})

/**
 * Ledger of points awarded per completed task. Stores the *components* of the
 * award (base / speed bonus / multiplier) so the exact formula — still open in
 * PROJECT_SPEC §7/§10 — can change without a schema change.
 */
export const pointsLog = mysqlTable('points_log', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // UNIQUE so points are awarded at most once per task even under a concurrent
  // double-complete race (issue #74). Nullable → MySQL allows many NULLs, so the
  // onDelete: 'set null' rows don't collide.
  taskId: int('task_id')
    .references(() => tasks.id, { onDelete: 'set null' })
    .unique(),
  basePoints: int('base_points').notNull(),
  speedBonus: int('speed_bonus').notNull().default(0),
  multiplier: decimal('multiplier', { precision: 4, scale: 2 }).notNull().default('1.00'),
  totalPoints: int('total_points').notNull(),
  awardedAt: timestamp('awarded_at').defaultNow().notNull(),
})

/**
 * Per-user, per-day rollup that drives the daily multiplier (grows with tasks
 * completed that day, resets at midnight — PROJECT_SPEC §7). Cap / growth rate
 * are open numbers (§10) and live in the points logic, not the schema.
 */
export const dailyStats = mysqlTable(
  'daily_stats',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    statDate: date('stat_date', { mode: 'string' }).notNull(),
    tasksCompleted: int('tasks_completed').notNull().default(0),
    pointsEarned: int('points_earned').notNull().default(0),
    multiplier: decimal('multiplier', { precision: 4, scale: 2 }).notNull().default('1.00'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [unique('daily_stats_user_date_unq').on(table.userId, table.statDate)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type EmailToken = typeof emailTokens.$inferSelect
export type EmailTokenType = EmailToken['type']
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type PointsLogEntry = typeof pointsLog.$inferSelect
export type DailyStat = typeof dailyStats.$inferSelect
