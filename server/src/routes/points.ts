import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { getPointsStats, getUserStats } from '../points/award.js'

export const pointsRouter = Router()

pointsRouter.use(requireAuth)

// GET /api/points — lean points summary for the authed user (dashboard card #37).
pointsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const stats = await getPointsStats(req.user!.id)
    res.json(stats)
  }),
)

// GET /api/points/stats — richer lifetime stats for the user page (#38).
pointsRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const stats = await getUserStats(req.user!.id)
    res.json(stats)
  }),
)
