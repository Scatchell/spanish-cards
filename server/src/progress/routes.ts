import { Router } from 'express';
import { getUserId } from '../auth/middleware.js';
import type { DbPool } from '../db.js';
import { countDueCards } from '../training/repository.js';
import { clampTzOffset, computeReviewMetrics, countLearningStages } from './metrics.js';
import { buildProgressReport } from './report.js';
import { countCards, countCardsByState, getAllReviews } from './repository.js';

export function progressRoutes(
  pool: DbPool,
  deps: { buildReport: typeof buildProgressReport } = { buildReport: buildProgressReport },
): Router {
  const router = Router();

  router.get('/report', async (req, res) => {
    const report = await deps.buildReport(pool, getUserId(req), new Date(), clampTzOffset(req.query.tzOffset));
    res.json(report);
  });

  router.get('/', async (req, res) => {
    const userId = getUserId(req);
    const now = new Date();
    const tzOffsetMinutes = clampTzOffset(req.query.tzOffset);
    const [reviews, totalCards, dueNow, stateRows] = await Promise.all([
      getAllReviews(pool, userId),
      countCards(pool, userId),
      countDueCards(pool, userId, now),
      countCardsByState(pool, userId),
    ]);
    res.json({
      totalCards,
      dueNow,
      stages: countLearningStages(stateRows),
      ...computeReviewMetrics(reviews, now, tzOffsetMinutes),
    });
  });

  return router;
}
