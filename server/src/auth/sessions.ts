import { randomBytes } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, users } from '../db/schema.js'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
export const SESSION_COOKIE = 'sid'
export const SESSION_MAX_AGE_MS = SESSION_TTL_MS

export type SessionUser = { id: number; email: string; displayName: string | null }

export async function createSession(userId: number): Promise<string> {
  const id = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({ id, userId, expiresAt })
  return id
}

/** Returns the user for a valid, unexpired session, or null. Expired sessions are pruned. */
export async function getSessionUser(sessionId: string): Promise<SessionUser | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    await deleteSession(sessionId)
    return null
  }
  return { id: row.id, email: row.email, displayName: row.displayName }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}
