import { Router } from 'express';
import type { DbPool } from '../db.js';
import { getCard, deleteCard, insertCards, listCards, updateCard } from './repository.js';
import { saveCardBatch, updateCardText } from './service.js';
import {
  deleteAlternate,
  getAlternate,
  insertAlternate,
  listAlternatesForField,
  updateAlternateText,
} from './alternates-repository.js';
import { createAlternate, deleteAlternateById, updateAlternate } from './alternates-service.js';
import { isAlternateField } from './alternates-validation.js';
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

  router.patch('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Card id must be an integer' });
      return;
    }
    const input = parseCardInputBody(req.body);
    if (input === null) {
      res.status(400).json({ error: 'Body must be { spanishText, englishText }' });
      return;
    }
    const result = await updateCardText(id, input, (cardId, valid) =>
      updateCard(pool, cardId, valid),
    );
    if (!result.ok && 'notFound' in result) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    if (!result.ok) {
      res.status(400).json({ errors: result.errors });
      return;
    }
    res.json({ card: result.card });
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

  router.post('/:id/alternates', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Card id must be an integer' });
      return;
    }
    const { field, text } = (req.body ?? {}) as Record<string, unknown>;
    if (!isAlternateField(field) || typeof text !== 'string') {
      res.status(400).json({ error: 'Body must be { field: "spanish" | "english", text: string }' });
      return;
    }
    const result = await createAlternate(id, field, text, {
      getCard: (cardId) => getCard(pool, cardId),
      listAlternates: (cardId, f) => listAlternatesForField(pool, cardId, f),
      insertAlternate: (cardId, f, t) => insertAlternate(pool, cardId, f, t),
      getAlternate: (altId) => getAlternate(pool, altId),
      updateAlternateText: (altId, t) => updateAlternateText(pool, altId, t),
      deleteAlternate: (altId) => deleteAlternate(pool, altId),
    });
    if (!result.ok) {
      res.status(result.status).json(result.status === 404 ? { error: 'Card not found' } : { error: result.error });
      return;
    }
    res.status(201).json({ alternate: result.alternate });
  });

  router.patch('/:id/alternates/:altId', async (req, res) => {
    const id = Number(req.params.id);
    const altId = Number(req.params.altId);
    if (!Number.isInteger(id) || !Number.isInteger(altId)) {
      res.status(400).json({ error: 'Card id and alternate id must be integers' });
      return;
    }
    const { text } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof text !== 'string') {
      res.status(400).json({ error: 'Body must be { text: string }' });
      return;
    }
    const result = await updateAlternate(id, altId, text, {
      getCard: (cardId) => getCard(pool, cardId),
      listAlternates: (cardId, f) => listAlternatesForField(pool, cardId, f),
      insertAlternate: (cardId, f, t) => insertAlternate(pool, cardId, f, t),
      getAlternate: (aId) => getAlternate(pool, aId),
      updateAlternateText: (aId, t) => updateAlternateText(pool, aId, t),
      deleteAlternate: (aId) => deleteAlternate(pool, aId),
    });
    if (!result.ok) {
      res.status(result.status).json(result.status === 404 ? { error: 'Alternate not found' } : { error: result.error });
      return;
    }
    res.json({ alternate: result.alternate });
  });

  router.delete('/:id/alternates/:altId', async (req, res) => {
    const id = Number(req.params.id);
    const altId = Number(req.params.altId);
    if (!Number.isInteger(id) || !Number.isInteger(altId)) {
      res.status(400).json({ error: 'Card id and alternate id must be integers' });
      return;
    }
    const result = await deleteAlternateById(id, altId, {
      getCard: (cardId) => getCard(pool, cardId),
      listAlternates: (cardId, f) => listAlternatesForField(pool, cardId, f),
      insertAlternate: (cardId, f, t) => insertAlternate(pool, cardId, f, t),
      getAlternate: (aId) => getAlternate(pool, aId),
      updateAlternateText: (aId, t) => updateAlternateText(pool, aId, t),
      deleteAlternate: (aId) => deleteAlternate(pool, aId),
    });
    if (!result.ok) {
      res.status(result.status).json({ error: 'Alternate not found' });
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
  return cards.map(coerceCardInput);
}

// Parses a single { spanishText, englishText } body, returning null only when
// the body isn't an object at all. Missing/non-string fields coerce to '' so
// validation can report them per-field, matching the batch path.
function parseCardInputBody(body: unknown): CardInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  return coerceCardInput(body);
}

function coerceCardInput(card: unknown): CardInput {
  const { spanishText, englishText } = (card ?? {}) as Record<string, unknown>;
  return {
    spanishText: typeof spanishText === 'string' ? spanishText : '',
    englishText: typeof englishText === 'string' ? englishText : '',
  };
}
