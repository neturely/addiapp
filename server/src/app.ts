import express, { type Express } from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health.js'

/**
 * Build the Express application. Kept separate from server startup (index.ts)
 * so it can be imported for testing without binding a port.
 */
export function createApp(): Express {
  const app = express()

  app.use(cors())
  app.use(express.json())

  // API routes are mounted under /api
  app.use('/api', healthRouter)

  return app
}
