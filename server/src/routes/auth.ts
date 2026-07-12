import { Router, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
} from '../auth/sessions.js'
import { createEmailToken, consumeEmailToken } from '../auth/emailTokens.js'
import { emailService } from '../email/index.js'
import { verificationEmail, passwordResetEmail } from '../email/templates.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { config } from '../config.js'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().trim().min(1).max(100).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const verifySchema = z.object({ token: z.string().min(1) })
const emailOnlySchema = z.object({ email: z.string().email() })
const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// Light rate limit on the resend endpoint to curb abuse/spam.
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
})

// Same treatment for the password-reset request (email-sending, enumeration-prone).
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
})

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  })
}

async function sendVerificationEmail(userId: number, email: string): Promise<void> {
  const token = await createEmailToken(userId, 'verify')
  await emailService.send(verificationEmail(email, token))
}

async function sendPasswordResetEmail(userId: number, email: string): Promise<void> {
  const token = await createEmailToken(userId, 'reset')
  await emailService.send(passwordResetEmail(email, token))
}

/**
 * Send a transactional email without letting a provider hiccup fail the request
 * (issue #67). The DB state (account created / token stored) is already
 * committed and the user can always trigger a resend, so a send failure is
 * logged loudly server-side but does not become an error response. Never
 * silently swallowed — it's always logged.
 */
async function sendEmailBestEffort(context: string, send: () => Promise<void>): Promise<void> {
  try {
    await send()
  } catch (err) {
    console.error(`[addiapp-server] email send failed (${context}):`, err)
  }
}

// POST /register — creates the account (unverified) and emails a verification
// link. Does NOT log the user in: login is blocked until the email is verified.
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
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
    // The account exists now — a failed verification email must NOT fail the
    // registration (issue #67). If the send throws, it's logged and the user can
    // request a fresh link via /resend-verification.
    await sendEmailBestEffort(`verification for user ${result.insertId} <${email}>`, () =>
      sendVerificationEmail(result.insertId, email),
    )

    res.status(201).json({
      message: 'Account created. Check your email to verify your address before signing in.',
      email,
    })
  }),
)

// POST /login — blocks unverified accounts (403 email_not_verified).
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
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
    if (!user.emailVerified) {
      res.status(403).json({
        error: 'email_not_verified',
        message: 'Please verify your email before signing in.',
      })
      return
    }

    const sid = await createSession(user.id)
    setSessionCookie(res, sid)
    res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } })
  }),
)

// POST /verify — consumes a verification token, marks the account verified, and
// logs the user in.
authRouter.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const parsed = verifySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid token' })
      return
    }
    const userId = await consumeEmailToken(parsed.data.token, 'verify')
    if (userId === null) {
      res.status(400).json({ error: 'This verification link is invalid or has expired.' })
      return
    }
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId))
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const user = rows[0]
    if (!user) {
      res.status(400).json({ error: 'Account no longer exists.' })
      return
    }

    const sid = await createSession(user.id)
    setSessionCookie(res, sid)
    res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } })
  }),
)

// POST /resend-verification — always 200 (no account enumeration), rate-limited.
authRouter.post(
  '/resend-verification',
  resendLimiter,
  asyncHandler(async (req, res) => {
    const parsed = emailOnlySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email' })
      return
    }
    const rows = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1)
    const user = rows[0]
    if (user && !user.emailVerified) {
      // Best-effort so a provider hiccup on the retry path stays non-enumerating
      // (same generic 200) rather than 500ing (issue #67).
      await sendEmailBestEffort(`resend-verification for user ${user.id} <${user.email}>`, () =>
        sendVerificationEmail(user.id, user.email),
      )
    }
    res.json({
      message: 'If that account exists and is unverified, a new verification link has been sent.',
    })
  }),
)

// POST /forgot-password — request a reset. Always 200 (no account enumeration),
// rate-limited. Emails a reset link only if the account actually exists.
authRouter.post(
  '/forgot-password',
  forgotPasswordLimiter,
  asyncHandler(async (req, res) => {
    const parsed = emailOnlySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email' })
      return
    }
    const rows = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1)
    const user = rows[0]
    if (user) {
      // Best-effort so a provider hiccup keeps the same generic 200 (no
      // enumeration) instead of 500ing (issue #67 pattern).
      await sendEmailBestEffort(`password reset for user ${user.id} <${user.email}>`, () =>
        sendPasswordResetEmail(user.id, user.email),
      )
    }
    res.json({
      message: 'If an account exists for that email, a password reset link has been sent.',
    })
  }),
)

// POST /reset-password — consume a reset token, set the new password (bcrypt),
// and revoke ALL of the user's existing sessions. Does not log in: the user
// signs in fresh with the new password.
authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const parsed = resetSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
      return
    }
    const userId = await consumeEmailToken(parsed.data.token, 'reset')
    if (userId === null) {
      res.status(400).json({ error: 'This reset link is invalid or has expired.' })
      return
    }
    const passwordHash = await hashPassword(parsed.data.password)
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
    await deleteUserSessions(userId)
    res.json({ message: 'Your password has been reset. You can now sign in.' })
  }),
)

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const sid = req.cookies?.[SESSION_COOKIE] as string | undefined
    if (sid) await deleteSession(sid)
    // Clear with the same attributes the cookie was set with, so browsers
    // reliably remove it (a bare { path } can leave it in place in production).
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      path: '/',
    })
    res.status(204).end()
  }),
)

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})
