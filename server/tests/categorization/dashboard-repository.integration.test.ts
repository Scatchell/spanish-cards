import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { CATEGORIES } from '../../src/categorization/repository.js';
import { getCategoryMistakes, getCategorySummary, parseCursor } from '../../src/categorization/dashboard-repository.js';

// Connects to real dev Postgres via loadConfig().databaseUrl, same caveat as
// repository.integration.test.ts: do not run alongside `pnpm dev`.
const MARKER = '__dashboard_repository_integration_test__';
const FAKE_CARD_ID = -999998;

let pool: DbPool;

async function cleanup() {
  await pool.query('DELETE FROM review_history WHERE submitted_text LIKE $1', [`${MARKER}%`]);
}

async function insertMistake(input: {
  category: string;
  createdAt: string;
  submittedTextSuffix: string;
}): Promise<number> {
  const historyResult = await pool.query<{ id: number }>(
    `INSERT INTO review_history (card_id, direction, verdict, rating, correct_text, submitted_text)
     VALUES ($1, 'english-to-spanish', 'incorrect', 'again', 'la casa blanca', $2)
     RETURNING id`,
    [FAKE_CARD_ID, `${MARKER} ${input.submittedTextSuffix}`],
  );
  const row = historyResult.rows[0];
  if (!row) throw new Error('Insert did not return an id');
  const categorizationResult = await pool.query<{ id: number }>(
    `INSERT INTO review_categorizations (review_history_id, category, rationale, key_terms, model, created_at)
     VALUES ($1, $2, 'test rationale', $3, 'gpt-5.4-mini', $4)
     RETURNING id`,
    [row.id, input.category, ['blanco', 'blanca'], input.createdAt],
  );
  const categorizationRow = categorizationResult.rows[0];
  if (!categorizationRow) throw new Error('Insert did not return an id');
  return categorizationRow.id;
}

beforeAll(() => {
  pool = createPool(loadConfig().databaseUrl);
});

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('getCategorySummary', () => {
  it('zero-fills categories with no rows and counts categories with rows', async () => {
    // Dev Postgres carries real categorized mistakes from normal app usage,
    // so an "untouched" category's count isn't necessarily 0 — snapshot it
    // before inserting and assert it's unchanged, rather than assuming 0.
    const before = await getCategorySummary(pool);
    const untouchedCategoryBefore = new Map(before.map((row) => [row.category, row.count])).get('word_order');

    await insertMistake({ category: 'agreement', createdAt: '2026-09-01T00:00:00Z', submittedTextSuffix: 'a1' });
    await insertMistake({ category: 'agreement', createdAt: '2026-09-02T00:00:00Z', submittedTextSuffix: 'a2' });
    await insertMistake({ category: 'idiom', createdAt: '2026-09-01T00:00:00Z', submittedTextSuffix: 'i1' });

    const summary = await getCategorySummary(pool);
    const byCategory = new Map(summary.map((row) => [row.category, row.count]));

    expect(summary).toHaveLength(CATEGORIES.length);
    for (const category of CATEGORIES) {
      expect(byCategory.has(category)).toBe(true);
    }
    expect(byCategory.get('agreement')).toBeGreaterThanOrEqual(2);
    expect(byCategory.get('idiom')).toBeGreaterThanOrEqual(1);
    expect(byCategory.get('word_order')).toBe(untouchedCategoryBefore);
  });
});

describe('getCategoryMistakes', () => {
  it('returns only the requested category, newest first', async () => {
    await insertMistake({ category: 'verb_form', createdAt: '2026-09-01T00:00:00Z', submittedTextSuffix: 'v1' });
    await insertMistake({ category: 'verb_form', createdAt: '2026-09-03T00:00:00Z', submittedTextSuffix: 'v2' });
    await insertMistake({ category: 'agreement', createdAt: '2026-09-02T00:00:00Z', submittedTextSuffix: 'a1' });

    const page = await getCategoryMistakes(pool, 'verb_form', { cursor: null, limit: 50 });
    const ours = page.items.filter((item) => item.submittedText.startsWith(MARKER));

    expect(ours.every((item) => item.category === 'verb_form')).toBe(true);
    expect(ours[0]?.submittedText).toContain('v2');
    expect(ours[1]?.submittedText).toContain('v1');
  });

  it('paginates with a stable tie-break when created_at is identical, and sets nextCursor', async () => {
    const sameTimestamp = '2026-09-05T00:00:00Z';
    const firstId = await insertMistake({ category: 'spelling_accents', createdAt: sameTimestamp, submittedTextSuffix: 's1' });
    const secondId = await insertMistake({ category: 'spelling_accents', createdAt: sameTimestamp, submittedTextSuffix: 's2' });
    const orderedIds = [firstId, secondId].sort((a, b) => b - a); // (created_at DESC, id DESC)

    const firstPage = await getCategoryMistakes(pool, 'spelling_accents', { cursor: null, limit: 1 });
    const ourFirstItem = firstPage.items.find((item) => item.submittedText.startsWith(MARKER));
    expect(ourFirstItem?.id).toBe(orderedIds[0]);
    expect(firstPage.nextCursor).not.toBeNull();

    const cursor = parseCursor(firstPage.nextCursor as string);
    expect(cursor).not.toBeNull();
    const secondPage = await getCategoryMistakes(pool, 'spelling_accents', { cursor, limit: 50 });
    const ourSecondItem = secondPage.items.find((item) => item.submittedText.startsWith(MARKER));
    expect(ourSecondItem?.id).toBe(orderedIds[1]);
  });

  it('returns nextCursor null when the page is short of the limit', async () => {
    await insertMistake({ category: 'idiom', createdAt: '2026-09-01T00:00:00Z', submittedTextSuffix: 'i-only' });
    const page = await getCategoryMistakes(pool, 'idiom', { cursor: null, limit: 50 });
    expect(page.nextCursor).toBeNull();
  });
});

describe('parseCursor', () => {
  it('parses a valid cursor string', () => {
    expect(parseCursor('2026-09-12T14:03:11.000Z,481')).toEqual({
      createdAt: '2026-09-12T14:03:11.000Z',
      id: 481,
    });
  });

  it('returns null for a malformed cursor', () => {
    expect(parseCursor('not-a-cursor')).toBeNull();
    expect(parseCursor('2026-09-12T14:03:11.000Z,not-a-number')).toBeNull();
  });
});
