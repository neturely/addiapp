import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { getPointsStats } from '../points/award.js'

export const pointsRouter = Router()

pointsRouter.use(requireAuth)

// GET /api/points — points/stats summary for the authed user.
pointsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const stats = await getPointsStats(req.user!.id)
    res.json(stats)
  }),
)
