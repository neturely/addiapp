import type { Request, Response, NextFunction } from 'express'
import { SESSION_COOKIE, getSessionUser } from '../auth/sessions.js'

/** Rejects the request with 401 unless a valid session cookie is present. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sid = req.cookies?.[SESSION_COOKIE] as string | undefined
  if (!sid) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  const user = await getSessionUser(sid)
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  req.user = user
  next()
}
