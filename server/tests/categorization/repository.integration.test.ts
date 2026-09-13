import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import {
  findUncategorizedReviewHistory,
  insertCategorizationBatch,
} from '../../src/categorization/repository.js';

// This suite connects to the real dev Postgres via loadConfig().databaseUrl.
// Do not run it while `pnpm dev` is also running: the dev server's
// categorization scheduler could pick up these synthetic rows on its hourly
// tick and send them to the real OpenAI API.
//
// Marks every row this test file creates, so cleanup only ever touches rows
// this suite owns, never real dev data. Card id is negative (schema allows
// any integer; real cards start at 1 from a serial sequence) as a second,
// belt-and-suspenders marker.
const MARKER = '__categorization_integration_test__';
const FAKE_CARD_ID = -999999;

let pool: DbPool;

async function cleanup() {
  await pool.query('DELETE FROM review_history WHERE submitted_text LIKE $1', [`${MARKER}%`]);
}

async function insertHistoryRow(input: {
  verdict: string;
  submittedText: string;
}): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO review_history (card_id, direction, verdict, rating, correct_text, submitted_text)
     VALUES ($1, 'english-to-spanish', $2, 'again', 'la respuesta correcta', $3)
     RETURNING id`,
    [FAKE_CARD_ID, input.verdict, input.submittedText],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Insert did not return an id');
  }
  return row.id;
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

describe('findUncategorizedReviewHistory', () => {
  it('excludes correct verdicts, already-categorized rows, and rows outside the marker', async () => {
    const incorrectId = await insertHistoryRow({
      verdict: 'incorrect',
      submittedText: `${MARKER} pending incorrect`,
    });
    const correctWithDiffsId = await insertHistoryRow({
      verdict: 'correctWithDifferences',
      submittedText: `${MARKER} pending correctWithDifferences`,
    });
    const alreadyCategorizedId = await insertHistoryRow({
      verdict: 'incorrect',
      submittedText: `${MARKER} already categorized`,
    });
    await insertHistoryRow({
      verdict: 'correct',
      submittedText: `${MARKER} plain correct`,
    });

    await insertCategorizationBatch(pool, [
      {
        reviewHistoryId: alreadyCategorizedId,
        category: 'verb_form',
        rationale: 'pre-seeded as already processed',
        practiceTargets: [],
        model: 'gpt-5.4-mini',
      },
    ]);

    const pending = await findUncategorizedReviewHistory(pool);
    const pendingIds = pending.map((row) => row.id);

    expect(pendingIds).toContain(incorrectId);
    expect(pendingIds).toContain(correctWithDiffsId);
    expect(pendingIds).not.toContain(alreadyCategorizedId);

    const pendingSubmittedTexts = pending.map((row) => row.submittedText);
    expect(pendingSubmittedTexts).not.toContain(`${MARKER} plain correct`);
  });
});

describe('insertCategorizationBatch', () => {
  it('inserts one row per input and the fields round-trip correctly', async () => {
    const historyId = await insertHistoryRow({
      verdict: 'incorrect',
      submittedText: `${MARKER} round trip`,
    });

    await insertCategorizationBatch(pool, [
      {
        reviewHistoryId: historyId,
        category: 'agreement',
        rationale: 'la casa blanco should be la casa blanca',
        practiceTargets: [{ expected: 'blanca', submitted: 'blanco' }],
        model: 'gpt-5.4-mini',
      },
    ]);

    const result = await pool.query<{
      review_history_id: number;
      category: string;
      rationale: string;
      model: string;
    }>('SELECT review_history_id, category, rationale, model FROM review_categorizations WHERE review_history_id = $1', [
      historyId,
    ]);

    expect(result.rows).toEqual([
      {
        review_history_id: historyId,
        category: 'agreement',
        rationale: 'la casa blanco should be la casa blanca',
        model: 'gpt-5.4-mini',
      },
    ]);

    const targets = await pool.query<{ expected: string; submitted: string | null }>(
      `SELECT pt.expected, pt.submitted FROM practice_targets pt
       JOIN review_categorizations rc ON rc.id = pt.review_categorization_id
       WHERE rc.review_history_id = $1`,
      [historyId],
    );
    expect(targets.rows).toEqual([{ expected: 'blanca', submitted: 'blanco' }]);
  });

  it('cascades on delete: removing the review_history row removes its categorization', async () => {
    const historyId = await insertHistoryRow({
      verdict: 'incorrect',
      submittedText: `${MARKER} cascade check`,
    });
    await insertCategorizationBatch(pool, [
      {
        reviewHistoryId: historyId,
        category: 'spelling_accents',
        rationale: 'tambien vs también',
        practiceTargets: [{ expected: 'también', submitted: 'tambien' }],
        model: 'gpt-5.4-mini',
      },
    ]);
    const categorizationRow = await pool.query<{ id: number }>(
      'SELECT id FROM review_categorizations WHERE review_history_id = $1',
      [historyId],
    );
    const categorizationId = categorizationRow.rows[0]!.id;

    await pool.query('DELETE FROM review_history WHERE id = $1', [historyId]);

    const result = await pool.query('SELECT 1 FROM review_categorizations WHERE review_history_id = $1', [
      historyId,
    ]);
    expect(result.rows).toHaveLength(0);

    const targets = await pool.query('SELECT 1 FROM practice_targets WHERE review_categorization_id = $1', [
      categorizationId,
    ]);
    expect(targets.rows).toHaveLength(0);
  });

  it('is a no-op for an empty input array', async () => {
    await expect(insertCategorizationBatch(pool, [])).resolves.toBeUndefined();
  });
});
