import { Router } from 'express';
import type { DbPool } from '../db.js';
import { cardExists, getSchedule, getTrainingQueue, upsertSchedule } from './repository.js';
import { isReviewRating, rateSchedule } from './scheduler.js';

export function trainingRoutes(pool: DbPool): Router {
  const router = Router();

  router.get('/queue', async (req, res) => {
    const scope = req.query.scope === 'ahead' ? 'ahead' : 'due';
    res.json({ cards: await getTrainingQueue(pool, scope, new Date()) });
  });

  router.post('/reviews', async (req, res) => {
    const { cardId, rating } = (req.body ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(cardId) || !isReviewRating(rating)) {
      res.status(400).json({
        error: 'Body must be { cardId, rating } with rating one of again/hard/good/easy',
      });
      return;
    }
    if (!(await cardExists(pool, cardId as number))) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    const current = await getSchedule(pool, cardId as number);
    const next = rateSchedule(current, rating, new Date());
    await upsertSchedule(pool, cardId as number, next);
    res.json({ schedule: { due: next.due.toISOString() } });
  });

  return router;
}
