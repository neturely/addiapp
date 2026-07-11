import express, { type Express } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { healthRouter } from './routes/health.js'
import { authRouter } from './routes/auth.js'

/**
 * Build the Express application. Kept separate from server startup (index.ts)
 * so it can be imported for testing without binding a port.
 */
export function createApp(): Express {
  const app = express()

  // In dev the Vite proxy makes requests same-origin; in prod the SPA is served
  // from the same host. `origin: true` + credentials keeps the session cookie
  // working if the API is ever hit cross-origin.
  app.use(cors({ origin: true, credentials: true }))
  app.use(express.json())
  app.use(cookieParser())

  // API routes are mounted under /api
  app.use('/api', healthRouter)
  app.use('/api/auth', authRouter)

  return app
}
