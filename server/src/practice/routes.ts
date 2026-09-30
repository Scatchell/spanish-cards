import { Router } from 'express';
import { getUserId } from '../auth/middleware.js';
import type { DbPool } from '../db.js';
import type { PracticeSentenceGenerator } from './generator.js';
import { getMistakeContext, getPracticeSession as repoGetPracticeSession, upsertPracticeSession } from './repository.js';
import type { PracticeSession } from './repository.js';
import { selectPracticeExamples } from './selector.js';
import { generatePracticeSession } from './service.js';
import type { GenerateResult } from './service.js';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function practiceRoutes(
  pool: DbPool,
  generate: PracticeSentenceGenerator | null,
  deps: {
    getPracticeSession: (userId: number, id: number) => Promise<PracticeSession | null>;
    handleGenerate: (userId: number, id: number) => Promise<GenerateResult>;
  } = {
    getPracticeSession: (userId, id) => repoGetPracticeSession(pool, userId, id),
    handleGenerate: (userId, id) =>
      generatePracticeSession(
        {
          getMistakeContext: (mistakeId) => getMistakeContext(pool, userId, mistakeId),
          selectPracticeExamples: (mistakeId) => selectPracticeExamples(pool, userId, mistakeId),
          generate,
          upsertPracticeSession: (input) => upsertPracticeSession(pool, input),
        },
        userId,
        id,
      ),
  },
): Router {
  const router = Router();

  router.get('/:categorizationId', async (req, res) => {
    const id = parseId(req.params.categorizationId);
    if (id === null) {
      res.status(400).json({ error: 'Invalid categorization id' });
      return;
    }
    const session = await deps.getPracticeSession(getUserId(req), id);
    if (!session) {
      res.status(404).json({ error: 'No practice session yet' });
      return;
    }
    res.json({ session });
  });

  router.post('/:categorizationId', async (req, res) => {
    const id = parseId(req.params.categorizationId);
    if (id === null) {
      res.status(400).json({ error: 'Invalid categorization id' });
      return;
    }
    let result: GenerateResult;
    try {
      result = await deps.handleGenerate(getUserId(req), id);
    } catch (err) {
      console.error('Practice sentence generation failed:', err);
      res.status(502).json({ error: 'Practice sentence generation failed' });
      return;
    }
    if (result.status === 'unavailable') {
      res.status(503).json({ error: 'Practice sentence generation is not configured' });
      return;
    }
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Mistake not found' });
      return;
    }
    res.json({ session: result.session });
  });

  return router;
}
