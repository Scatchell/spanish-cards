import { Router } from 'express';
import { getUserId } from '../auth/middleware.js';
import type { DbPool } from '../db.js';
import { clampTzOffset } from './metrics.js';
import { buildProgressReport } from './report.js';

export function progressRoutes(
  pool: DbPool,
  deps: { buildReport: typeof buildProgressReport } = { buildReport: buildProgressReport },
): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const report = await deps.buildReport(pool, getUserId(req), new Date(), clampTzOffset(req.query.tzOffset));
    res.json(report);
  });

  return router;
}
