import { Router } from 'express'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { tasks, type Task } from '../db/schema.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { asyncHandler } from '../lib/asyncHandler.js'

export const tasksRouter = Router()

// Every task route requires an authenticated, verified session.
tasksRouter.use(requireAuth)

const complexity = z.enum(['low', 'medium', 'high'])
const status = z.enum(['backlog', 'in_progress', 'done'])

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  complexity,
  estimatedMinutes: z.number().int().positive().max(100_000),
})

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    complexity: complexity.optional(),
    estimatedMinutes: z.number().int().positive().max(100_000).optional(),
    status: status.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

async function findOwnedTask(id: number, userId: number): Promise<Task | null> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Lifecycle timestamps derived from a status change. Points/speed-bonus logic
 * (issue #28) consumes started_at / actual_minutes; here we only record the raw
 * timing. actual_minutes is left null on a done transition with no start time.
 */
function statusTransitionFields(newStatus: Task['status'], existing: Task): Partial<Task> {
  const now = new Date()
  if (newStatus === 'in_progress') {
    return existing.startedAt ? {} : { startedAt: now }
  }
  if (newStatus === 'done') {
    const fields: Partial<Task> = { completedAt: now }
    if (existing.startedAt) {
      fields.actualMinutes = Math.max(
        0,
        Math.round((now.getTime() - existing.startedAt.getTime()) / 60_000),
      )
    }
    return fields
  }
  // Re-opening to backlog clears the lifecycle timing.
  return { startedAt: null, completedAt: null, actualMinutes: null }
}

function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

// GET /api/tasks?status=backlog|in_progress|done
tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id
    const conditions = [eq(tasks.userId, userId)]
    if (typeof req.query.status === 'string') {
      const parsed = status.safeParse(req.query.status)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid status filter' })
        return
      }
      conditions.push(eq(tasks.status, parsed.data))
    }
    const rows = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
    res.json({ tasks: rows })
  }),
)

// POST /api/tasks
tasksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
      return
    }
    const [result] = await db.insert(tasks).values({ ...parsed.data, userId: req.user!.id })
    const created = await findOwnedTask(result.insertId, req.user!.id)
    res.status(201).json({ task: created })
  }),
)

// GET /api/tasks/:id
tasksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid task id' })
      return
    }
    const task = await findOwnedTask(id, req.user!.id)
    if (!task) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    res.json({ task })
  }),
)

// PATCH /api/tasks/:id
tasksRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid task id' })
      return
    }
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
      return
    }
    const existing = await findOwnedTask(id, req.user!.id)
    if (!existing) {
      res.status(404).json({ error: 'Task not found' })
      return
    }

    const updates: Partial<Task> = { ...parsed.data }
    if (parsed.data.status && parsed.data.status !== existing.status) {
      Object.assign(updates, statusTransitionFields(parsed.data.status, existing))
    }

    await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, id), eq(tasks.userId, req.user!.id)))
    const updated = await findOwnedTask(id, req.user!.id)
    res.json({ task: updated })
  }),
)

// DELETE /api/tasks/:id
tasksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id)
    if (id === null) {
      res.status(400).json({ error: 'Invalid task id' })
      return
    }
    const existing = await findOwnedTask(id, req.user!.id)
    if (!existing) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, req.user!.id)))
    res.status(204).end()
  }),
)
