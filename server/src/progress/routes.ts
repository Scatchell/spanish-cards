import { Router } from 'express';
import { getUserId } from '../auth/middleware.js';
import type { DbPool } from '../db.js';
import { countDueCards } from '../training/repository.js';
import { clampTzOffset, computeReviewMetrics, countLearningStages } from './metrics.js';
import { countCards, countCardsByState, getAllReviews } from './repository.js';

export function progressRoutes(pool: DbPool): Router {
  const router = Router();

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
