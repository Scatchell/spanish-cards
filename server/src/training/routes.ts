import { Router } from 'express';
import type { DbPool } from '../db.js';
import { getTrainingQueue } from './repository.js';
import { recordReview } from './service.js';
import { parseReviewRequest } from './validation.js';

export function trainingRoutes(pool: DbPool): Router {
  const router = Router();

  router.get('/queue', async (req, res) => {
    const scope = req.query.scope === 'ahead' ? 'ahead' : 'due';
    res.json({ cards: await getTrainingQueue(pool, scope, new Date()) });
  });

  router.post('/reviews', async (req, res) => {
    const request = parseReviewRequest(req.body);
    if (!request) {
      res.status(400).json({
        error:
          'Body must be { cardId, rating, direction, verdict, submittedText } with rating one of again/hard/good/easy and verdict one of correct/correctWithDifferences/incorrect',
      });
      return;
    }
    const outcome = await recordReview(pool, request, new Date());
    if (!outcome) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    res.json({ schedule: { due: outcome.due.toISOString() }, wasDue: outcome.wasDue });
  });

  return router;
}
