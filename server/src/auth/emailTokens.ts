import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { emailTokens, type EmailTokenType } from '../db/schema.js'

const VERIFY_TTL_MS = 1000 * 60 * 60 * 24 // 24 hours
const RESET_TTL_MS = 1000 * 60 * 60 // 1 hour

export const tokenTtl: Record<EmailTokenType, number> = {
  verify: VERIFY_TTL_MS,
  reset: RESET_TTL_MS,
}

export async function createEmailToken(userId: number, type: EmailTokenType): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + tokenTtl[type])
  await db.insert(emailTokens).values({ token, userId, type, expiresAt })
  return token
}

/**
 * Validates a token of the expected type and marks it used. Returns the owning
 * user id, or null if the token is missing, wrong type, already used, or expired.
 */
export async function consumeEmailToken(
  token: string,
  type: EmailTokenType,
): Promise<number | null> {
  const rows = await db.select().from(emailTokens).where(eq(emailTokens.token, token)).limit(1)
  const row = rows[0]
  if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null
  }
  await db.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.token, token))
  return row.userId
}
