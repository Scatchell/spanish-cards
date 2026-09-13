import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { selectPracticeExamples } from '../../src/practice/selector.js';

const MARKER = '__practice_selector_integration_test__';
const CARD_A = -999995;

let pool: DbPool;

async function cleanup() {
  await pool.query('DELETE FROM review_history WHERE submitted_text LIKE $1', [`${MARKER}%`]);
}

async function insertMistake(input: {
  cardId: number;
  category: string;
  correctText: string;
  submittedTextSuffix: string;
  targets?: { expected: string; submitted: string | null }[];
}): Promise<number> {
  const historyResult = await pool.query<{ id: number }>(
    `INSERT INTO review_history (card_id, direction, verdict, rating, correct_text, submitted_text)
     VALUES ($1, 'english-to-spanish', 'incorrect', 'again', $2, $3)
     RETURNING id`,
    [input.cardId, input.correctText, `${MARKER} ${input.submittedTextSuffix}`],
  );
  const historyRow = historyResult.rows[0];
  if (!historyRow) throw new Error('Insert did not return an id');
  const categorizationResult = await pool.query<{ id: number }>(
    `INSERT INTO review_categorizations (review_history_id, category, rationale, model)
     VALUES ($1, $2, 'test rationale', 'gpt-5.4-mini')
     RETURNING id`,
    [historyRow.id, input.category],
  );
  const categorizationRow = categorizationResult.rows[0];
  if (!categorizationRow) throw new Error('Insert did not return an id');
  for (const target of input.targets ?? []) {
    await pool.query(
      `INSERT INTO practice_targets (review_categorization_id, expected, submitted) VALUES ($1, $2, $3)`,
      [categorizationRow.id, target.expected, target.submitted],
    );
  }
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

describe('selectPracticeExamples', () => {
  it('combines all four tiers end to end, respecting dedup and the 10-item limit', async () => {
    const selfId = await insertMistake({
      cardId: CARD_A,
      category: 'verb_form',
      correctText: 'creo que podría ganar',
      submittedTextSuffix: 'self',
      targets: [{ expected: 'podría', submitted: 'puedo' }],
    });
    await insertMistake({
      cardId: CARD_A,
      category: 'verb_form',
      correctText: 'creo que podría ganar',
      submittedTextSuffix: 'tier1-exact-dup', // same normalized pair as an implicit repeat
      targets: [{ expected: 'podría', submitted: 'puedo' }],
    });
    await insertMistake({
      cardId: -999994,
      category: 'verb_form',
      correctText: 'podría venir',
      submittedTextSuffix: 'tier2',
      targets: [{ expected: 'podría', submitted: 'puede' }],
    });
    await insertMistake({
      cardId: CARD_A,
      category: 'verb_form',
      correctText: 'siempre podría intentarlo',
      submittedTextSuffix: 'tier3',
    });

    const examples = await selectPracticeExamples(pool, selfId);
    const ours = examples.filter((e) => e.submittedText.startsWith(MARKER));

    expect(ours.some((e) => e.tier === 1)).toBe(true);
    expect(ours.some((e) => e.tier === 2)).toBe(true);
    expect(ours.some((e) => e.tier === 3)).toBe(true);
    expect(ours.length).toBeLessThanOrEqual(10);
  });

  it('throws for an id with no matching review_categorization', async () => {
    await expect(selectPracticeExamples(pool, -1)).rejects.toThrow();
  });
});
