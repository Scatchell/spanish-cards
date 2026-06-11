import { Router } from 'express';
import type { DbPool } from '../db.js';
import { deleteCard, insertCards, listCards } from './repository.js';
import { saveCardBatch } from './service.js';
import type { CardInput } from './validation.js';

export function cardRoutes(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ cards: await listCards(pool) });
  });

  router.post('/batch', async (req, res) => {
    const inputs = parseBatchBody(req.body);
    if (inputs === null) {
      res.status(400).json({ error: 'Body must be { cards: [{ spanishText, englishText }] }' });
      return;
    }
    const result = await saveCardBatch(inputs, (valid) => insertCards(pool, valid));
    res.status(201).json(result);
  });

  router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Card id must be an integer' });
      return;
    }
    const deleted = await deleteCard(pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}

function parseBatchBody(body: unknown): CardInput[] | null {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { cards?: unknown }).cards)) {
    return null;
  }
  const cards = (body as { cards: unknown[] }).cards;
  const inputs: CardInput[] = [];
  for (const card of cards) {
    const { spanishText, englishText } = (card ?? {}) as Record<string, unknown>;
    inputs.push({
      spanishText: typeof spanishText === 'string' ? spanishText : '',
      englishText: typeof englishText === 'string' ? englishText : '',
    });
  }
  return inputs;
}
