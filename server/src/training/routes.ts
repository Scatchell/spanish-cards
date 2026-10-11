import { Router } from 'express';
import { getUserId } from '../auth/middleware.js';
import type { DbPool } from '../db.js';
import { getTrainingQueue } from './repository.js';
import { recordReviewBatch } from './service.js';
import { parseReviewBatch } from './validation.js';

export function trainingRoutes(pool: DbPool): Router {
  const router = Router();

  router.get('/queue', async (req, res) => {
    const scope = req.query.scope === 'ahead' ? 'ahead' : 'due';
    res.json({ cards: await getTrainingQueue(pool, getUserId(req), scope, new Date()) });
  });

  // Accepts one or many queued reviews. Each carries a client-generated id (so
  // a retry is a no-op) and the time the user rated it. A bad item is reported
  // per-item and never fails the batch.
  router.post('/reviews', async (req, res) => {
    const entries = parseReviewBatch(req.body);
    if (!entries) {
      res.status(400).json({
        error: 'Body must be { reviews: [...] } with 1 to 100 reviews',
      });
      return;
    }
    const results = await recordReviewBatch(pool, getUserId(req), entries, new Date());
    res.json({ results });
  });

  return router;
}
