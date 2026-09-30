import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { insertCards, deleteCard } from '../../src/cards/repository.js';
import {
  deleteAlternate,
  getAlternate,
  insertAlternate,
  listAlternatesForField,
  updateAlternateText,
} from '../../src/cards/alternates-repository.js';
import { ensureTestUser } from '../helpers/test-users.js';

// Connects to the real dev Postgres via loadConfig(). Do not run while
// `pnpm dev` is also running (see server/tests/categorization/repository.integration.test.ts
// for why). Every card this suite creates is deleted in cleanup, which also
// exercises ON DELETE CASCADE for its alternates.
let pool: DbPool;
let testUserId: number;
const cardIds: number[] = [];

async function makeCard(): Promise<number> {
  const [card] = await insertCards(pool, testUserId, [{ spanishText: 'gato', englishText: 'cat' }]);
  cardIds.push(card!.id);
  return card!.id;
}

async function cleanup() {
  await Promise.all(cardIds.splice(0).map((id) => deleteCard(pool, testUserId, id)));
}

beforeAll(async () => {
  pool = createPool(loadConfig().databaseUrl);
  testUserId = await ensureTestUser(pool, 'alternates-repository@example.com');
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('insertCards', () => {
  it('returns empty alternates arrays, not undefined, for a freshly-inserted card', async () => {
    const [card] = await insertCards(pool, testUserId, [{ spanishText: 'perro', englishText: 'dog' }]);
    cardIds.push(card!.id);
    expect(card!.spanishAlternates).toEqual([]);
    expect(card!.englishAlternates).toEqual([]);
    await cleanup();
  });

  it('saves alternates submitted with new cards, in order', async () => {
    const [card] = await insertCards(pool, testUserId, [
      { spanishText: 'coche', englishText: 'car', spanishAlternates: ['auto', 'carro'], englishAlternates: [] },
    ]);
    cardIds.push(card!.id);
    expect(card!.spanishAlternates.map((alternate) => alternate.text)).toEqual(['auto', 'carro']);
    const stored = await listAlternatesForField(pool, card!.id, 'spanish');
    expect(stored.map((alternate) => [alternate.text, alternate.position])).toEqual([
      ['auto', 0],
      ['carro', 1],
    ]);
    await cleanup();
  });
});

describe('alternates repository', () => {
  it('assigns increasing positions per (card, field) and lists them in order', async () => {
    const cardId = await makeCard();
    const first = await insertAlternate(pool, cardId, 'english', 'kitty');
    const second = await insertAlternate(pool, cardId, 'english', 'feline');
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);

    const list = await listAlternatesForField(pool, cardId, 'english');
    expect(list.map((a) => a.text)).toEqual(['kitty', 'feline']);
    await cleanup();
  });

  it('keeps positions independent per field', async () => {
    const cardId = await makeCard();
    const englishFirst = await insertAlternate(pool, cardId, 'english', 'kitty');
    const spanishFirst = await insertAlternate(pool, cardId, 'spanish', 'minino');
    expect(englishFirst.position).toBe(0);
    expect(spanishFirst.position).toBe(0);
    await cleanup();
  });

  it('updates text in place without changing position or id', async () => {
    const cardId = await makeCard();
    const created = await insertAlternate(pool, cardId, 'english', 'kitty');
    const updated = await updateAlternateText(pool, created.id, 'kitten');
    expect(updated).toMatchObject({ id: created.id, text: 'kitten', position: 0 });
    await cleanup();
  });

  it('returns null from updateAlternateText for a missing id', async () => {
    const result = await updateAlternateText(pool, 999999, 'x');
    expect(result).toBeNull();
  });

  it('deletes an alternate and reports success', async () => {
    const cardId = await makeCard();
    const created = await insertAlternate(pool, cardId, 'english', 'kitty');
    expect(await deleteAlternate(pool, created.id)).toBe(true);
    expect(await getAlternate(pool, created.id)).toBeNull();
    await cleanup();
  });

  it('reports false deleting a missing id', async () => {
    expect(await deleteAlternate(pool, 999999)).toBe(false);
  });

  it('cascades on card deletion', async () => {
    const cardId = await makeCard();
    const created = await insertAlternate(pool, cardId, 'english', 'kitty');
    await deleteCard(pool, testUserId, cardId);
    cardIds.splice(cardIds.indexOf(cardId), 1);
    expect(await getAlternate(pool, created.id)).toBeNull();
  });
});
