import { Router } from 'express';
import type { DbPool } from '../db.js';
import { CATEGORIES } from './repository.js';
import type { Category } from './repository.js';
import {
  getCategoryMistakes as defaultGetCategoryMistakes,
  getCategorySummary as defaultGetCategorySummary,
  parseCursor,
} from './dashboard-repository.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

export function categorizationRoutes(
  pool: DbPool,
  deps: {
    getCategorySummary: typeof defaultGetCategorySummary;
    getCategoryMistakes: typeof defaultGetCategoryMistakes;
  } = { getCategorySummary: defaultGetCategorySummary, getCategoryMistakes: defaultGetCategoryMistakes },
): Router {
  const router = Router();

  router.get('/summary', async (_req, res) => {
    const categories = await deps.getCategorySummary(pool);
    res.json({ categories });
  });

  router.get('/mistakes', async (req, res) => {
    const { category, cursor: rawCursor, limit: rawLimit } = req.query;
    if (!isCategory(category)) {
      res.status(400).json({ error: 'Invalid or missing category' });
      return;
    }
    let cursor = null;
    if (typeof rawCursor === 'string') {
      cursor = parseCursor(rawCursor);
      if (!cursor) {
        res.status(400).json({ error: 'Invalid cursor' });
        return;
      }
    }
    const page = await deps.getCategoryMistakes(pool, category, {
      cursor,
      limit: parseLimit(rawLimit),
    });
    res.json(page);
  });

  return router;
}
