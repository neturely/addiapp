import { Router, type Response } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import {
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
} from '../auth/sessions.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const authRouter = Router()

const isProd = process.env.NODE_ENV === 'production'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().trim().min(1).max(100).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  })
}

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }
  const { email, password, displayName } = parsed.data

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (existing.length > 0) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const passwordHash = await hashPassword(password)
  const [result] = await db
    .insert(users)
    .values({ email, passwordHash, displayName: displayName ?? null })
  const userId = result.insertId

  const sid = await createSession(userId)
  setSessionCookie(res, sid)
  res.status(201).json({ user: { id: userId, email, displayName: displayName ?? null } })
})

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid credentials' })
    return
  }
  const { email, password } = parsed.data

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
  const user = rows[0]
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const sid = await createSession(user.id)
  setSessionCookie(res, sid)
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } })
})

authRouter.post('/logout', async (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE] as string | undefined
  if (sid) await deleteSession(sid)
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.status(204).end()
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})
