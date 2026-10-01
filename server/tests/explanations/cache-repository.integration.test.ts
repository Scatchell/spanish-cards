import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { findAnswerCheck, upsertAnswerCheck } from '../../src/explanations/answer-check-repository.js';
import type { NewAnswerCheck } from '../../src/explanations/answer-check-repository.js';
import { findExplanation, upsertExplanation } from '../../src/explanations/repository.js';

// Connects to real dev Postgres. Only touches the anonymous LLM cache tables
// (rows tagged with MARKER), never review_history.
const MARKER = '__cache_versioning_it__';
const SPANISH = `${MARKER} me llamo`;

let pool: DbPool;

async function cleanup() {
  await pool.query('DELETE FROM explanations WHERE spanish_text LIKE $1', [`${MARKER}%`]);
  await pool.query('DELETE FROM answer_checks WHERE spanish_text LIKE $1', [`${MARKER}%`]);
}

beforeAll(() => {
  pool = createPool(loadConfig().databaseUrl);
});
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('upsertExplanation', () => {
  it('overwrites the existing row in place when regenerated under a new version', async () => {
    const first = await upsertExplanation(pool, {
      spanishText: SPANISH,
      englishText: 'my name is',
      contentMarkdown: '- old',
      model: 'old-model',
      promptVersion: '1.0.0',
    });
    const second = await upsertExplanation(pool, {
      spanishText: SPANISH,
      englishText: 'my name is',
      contentMarkdown: '- fresh',
      model: 'new-model',
      promptVersion: '1.1.0',
    });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ contentMarkdown: '- fresh', model: 'new-model', promptVersion: '1.1.0' });
    const found = await findExplanation(pool, SPANISH, 'my name is');
    expect(found).toMatchObject({ id: first.id, contentMarkdown: '- fresh', promptVersion: '1.1.0' });
    const count = await pool.query('SELECT count(*)::int AS n FROM explanations WHERE spanish_text = $1', [SPANISH]);
    expect(count.rows[0].n).toBe(1);
  });
});

describe('upsertAnswerCheck', () => {
  const base: NewAnswerCheck = {
    spanishText: SPANISH,
    englishText: 'my name is',
    direction: 'english-to-spanish',
    submittedNormalized: 'me yamo',
    verdict: 'invalid',
    suggestedAnswer: null,
    feedbackPoints: ['old point'],
    submittedReading: { text: 'me yamo', translation: 'my name is' },
    model: 'old-model',
    promptVersion: '1.0.0',
  };
  const key = {
    spanishText: SPANISH,
    englishText: 'my name is',
    direction: 'english-to-spanish' as const,
    submittedNormalized: 'me yamo',
  };

  it('finds a row regardless of the version it was stamped with', async () => {
    await upsertAnswerCheck(pool, { ...base, promptVersion: '0.1.0' });
    expect(await findAnswerCheck(pool, key)).toMatchObject({ promptVersion: '0.1.0' });
  });

  it('overwrites the existing row in place, including every generated field', async () => {
    const first = await upsertAnswerCheck(pool, base);
    const second = await upsertAnswerCheck(pool, {
      ...base,
      verdict: 'valid',
      suggestedAnswer: 'me llamo',
      feedbackPoints: ['fresh point', 'second point'],
      submittedReading: null,
      model: 'new-model',
      promptVersion: '2.0.0',
    });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      verdict: 'valid',
      suggestedAnswer: 'me llamo',
      feedbackPoints: ['fresh point', 'second point'],
      submittedReading: null,
      model: 'new-model',
      promptVersion: '2.0.0',
    });
    const rows = await pool.query(
      'SELECT critique_markdown FROM answer_checks WHERE spanish_text = $1',
      [SPANISH],
    );
    expect(rows.rows).toEqual([{ critique_markdown: '- fresh point\n- second point' }]);
  });
});
