import 'express'
import type { SessionUser } from '../auth/sessions.js'

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser
    }
  }
}
