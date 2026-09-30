import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import {
  findTier1Candidates,
  findTier2Candidates,
  findTier3Candidates,
  findTier4Candidates,
  getMistakeContext,
  getPracticeSession,
  upsertPracticeSession,
} from '../../src/practice/repository.js';
import { ensureTestUser } from '../helpers/test-users.js';

// Connects to real dev Postgres, same caveat as the other *.integration.test.ts
// files in this repo: do not run alongside `pnpm dev`.
const MARKER = '__practice_repository_integration_test__';
const FAKE_CARD_ID = -999997;
const OTHER_CARD_ID = -999996;

let pool: DbPool;
let testUserId: number;

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
    `INSERT INTO review_history (user_id, card_id, direction, verdict, rating, correct_text, submitted_text)
     VALUES ($1, $2, 'english-to-spanish', 'incorrect', 'again', $3, $4)
     RETURNING id`,
    [testUserId, input.cardId, input.correctText, `${MARKER} ${input.submittedTextSuffix}`],
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

beforeAll(async () => {
  pool = createPool(loadConfig().databaseUrl);
  testUserId = await ensureTestUser(pool, 'integration-test@example.com');
});

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('getMistakeContext', () => {
  it('returns full detail including practice targets, with null card fields when no card matches', async () => {
    const id = await insertMistake({
      cardId: FAKE_CARD_ID,
      category: 'agreement',
      correctText: 'la casa blanca',
      submittedTextSuffix: 'ctx',
      targets: [{ expected: 'blanca', submitted: 'blanco' }],
    });

    const context = await getMistakeContext(pool, testUserId, id);

    expect(context).not.toBeNull();
    expect(context?.cardId).toBe(FAKE_CARD_ID);
    expect(context?.category).toBe('agreement');
    expect(context?.correctText).toBe('la casa blanca');
    expect(context?.practiceTargets).toEqual([{ expected: 'blanca', submitted: 'blanco' }]);
    // FAKE_CARD_ID never matches a real card row.
    expect(context?.spanishText).toBeNull();
    expect(context?.englishText).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    const context = await getMistakeContext(pool, testUserId, -1);
    expect(context).toBeNull();
  });
});

describe('findTier1Candidates', () => {
  it('matches on exact expected+submitted pair, excluding the given id', async () => {
    const selfId = await insertMistake({
      cardId: FAKE_CARD_ID,
      category: 'agreement',
      correctText: 'la casa blanca',
      submittedTextSuffix: 't1-self',
      targets: [{ expected: 'blanca', submitted: 'blanco' }],
    });
    const matchId = await insertMistake({
      cardId: OTHER_CARD_ID,
      category: 'agreement',
      correctText: 'una silla blanca',
      submittedTextSuffix: 't1-match',
      targets: [{ expected: 'blanca', submitted: 'blanco' }],
    });
    await insertMistake({
      cardId: OTHER_CARD_ID,
      category: 'agreement',
      correctText: 'un perro blanco',
      submittedTextSuffix: 't1-nomatch-submitted',
      targets: [{ expected: 'blanca', submitted: 'blanca' }],
    });

    const results = await findTier1Candidates(pool, testUserId, [{ expected: 'blanca', submitted: 'blanco' }], selfId);
    const ours = results.filter((r) => r.submittedText.startsWith(MARKER));

    expect(ours).toHaveLength(1);
    expect(ours[0]?.correctText).toBe('una silla blanca');
    void matchId;
  });

  it('treats null submitted as matching only other null submitted (IS NOT DISTINCT FROM)', async () => {
    const omissionId = await insertMistake({
      cardId: OTHER_CARD_ID,
      category: 'grammar_words',
      correctText: 'formamos parte',
      submittedTextSuffix: 't1-null',
      targets: [{ expected: 'formamos parte', submitted: null }],
    });

    const results = await findTier1Candidates(pool, testUserId, [{ expected: 'formamos parte', submitted: null }], -1);
    const ours = results.filter((r) => r.submittedText.startsWith(MARKER));

    expect(ours).toHaveLength(1);
    void omissionId;
  });
});

describe('findTier2Candidates', () => {
  it('matches on expected value regardless of submitted', async () => {
    await insertMistake({
      cardId: OTHER_CARD_ID,
      category: 'verb_form',
      correctText: 'podría ganar',
      submittedTextSuffix: 't2-a',
      targets: [{ expected: 'podría', submitted: 'puedo' }],
    });
    await insertMistake({
      cardId: OTHER_CARD_ID,
      category: 'verb_form',
      correctText: 'podría venir',
      submittedTextSuffix: 't2-b',
      targets: [{ expected: 'podría', submitted: 'puede' }],
    });

    const results = await findTier2Candidates(pool, testUserId, [{ expected: 'podría', submitted: 'puedo' }], -1);
    const ours = results.filter((r) => r.submittedText.startsWith(MARKER));

    expect(ours).toHaveLength(2);
  });
});

describe('findTier3Candidates', () => {
  it('matches other mistakes on the same card, excluding the given id', async () => {
    const selfId = await insertMistake({
      cardId: FAKE_CARD_ID,
      category: 'word_order',
      correctText: 'siempre voy',
      submittedTextSuffix: 't3-self',
    });
    await insertMistake({
      cardId: FAKE_CARD_ID,
      category: 'word_order',
      correctText: 'siempre voy',
      submittedTextSuffix: 't3-samecard',
    });
    await insertMistake({
      cardId: OTHER_CARD_ID,
      category: 'word_order',
      correctText: 'nunca voy',
      submittedTextSuffix: 't3-othercard',
    });

    const results = await findTier3Candidates(pool, testUserId, FAKE_CARD_ID, selfId);
    const ours = results.filter((r) => r.submittedText.startsWith(MARKER));

    expect(ours).toHaveLength(1);
    expect(ours[0]?.submittedText).toContain('t3-samecard');
  });
});

describe('findTier4Candidates', () => {
  it('returns up to sampleSize mistakes from the same category, excluding the given id', async () => {
    for (let i = 0; i < 3; i++) {
      await insertMistake({
        cardId: OTHER_CARD_ID,
        category: 'idiom',
        correctText: `idiom ${i}`,
        submittedTextSuffix: `t4-${i}`,
      });
    }

    const results = await findTier4Candidates(pool, testUserId, 'idiom', -1, 2);
    const ours = results.filter((r) => r.submittedText.startsWith(MARKER));

    expect(ours.length).toBeLessThanOrEqual(2);
    expect(ours.every((r) => r.category === 'idiom')).toBe(true);
  });
});

describe('upsertPracticeSession and getPracticeSession', () => {
  it('is absent before the first generate, present after, and overwritten on regenerate', async () => {
    const id = await insertMistake({
      cardId: FAKE_CARD_ID,
      category: 'agreement',
      correctText: 'la casa blanca',
      submittedTextSuffix: 'session',
    });

    expect(await getPracticeSession(pool, testUserId, id)).toBeNull();

    const firstExample = {
      cardId: OTHER_CARD_ID,
      category: 'agreement' as const,
      correctText: 'una silla blanca',
      submittedText: 'una silla blanco',
      direction: 'english-to-spanish',
      rationale: 'r',
      spanishText: null,
      englishText: null,
      practiceTargets: [],
      tier: 1 as const,
    };
    const firstSentence = { spanish: 'la mesa blanca', english: 'the white table' };

    const first = await upsertPracticeSession(pool, {
      reviewCategorizationId: id,
      model: 'gpt-5.4',
      generatedAt: '2026-09-01T00:00:00.000Z',
      examples: [firstExample],
      sentences: [firstSentence],
    });
    expect(first.sentences).toEqual([firstSentence]);

    const fetched = await getPracticeSession(pool, testUserId, id);
    expect(fetched?.sentences).toEqual([firstSentence]);

    const secondSentence = { spanish: 'el coche blanco', english: 'the white car' };
    const second = await upsertPracticeSession(pool, {
      reviewCategorizationId: id,
      model: 'gpt-5.4',
      generatedAt: '2026-09-02T00:00:00.000Z',
      examples: [firstExample],
      sentences: [secondSentence],
    });
    expect(second.id).toBe(first.id);
    expect(second.sentences).toEqual([secondSentence]);

    const refetched = await getPracticeSession(pool, testUserId, id);
    expect(refetched?.sentences).toEqual([secondSentence]);
  });

  it('cascades on delete: removing review_history removes the practice session', async () => {
    const id = await insertMistake({
      cardId: FAKE_CARD_ID,
      category: 'agreement',
      correctText: 'la casa blanca',
      submittedTextSuffix: 'cascade',
    });
    await upsertPracticeSession(pool, {
      reviewCategorizationId: id,
      model: 'gpt-5.4',
      generatedAt: '2026-09-01T00:00:00.000Z',
      examples: [],
      sentences: [],
    });

    await pool.query(
      `DELETE FROM review_history WHERE id = (SELECT review_history_id FROM review_categorizations WHERE id = $1)`,
      [id],
    );

    expect(await getPracticeSession(pool, testUserId, id)).toBeNull();
  });

  it('never returns another user\'s mistakes as context, candidates, or sessions', async () => {
    const otherUser = await ensureTestUser(pool, 'practice-other@example.com');
    const id = await insertMistake({
      cardId: FAKE_CARD_ID,
      category: 'agreement',
      correctText: 'la casa blanca',
      submittedTextSuffix: 'cross-user',
      targets: [{ expected: 'blanca', submitted: 'blanco' }],
    });

    expect(await getMistakeContext(pool, otherUser, id)).toBeNull();
    expect(await findTier1Candidates(pool, otherUser, [{ expected: 'blanca', submitted: 'blanco' }], -1)).toEqual([]);
    expect(await findTier2Candidates(pool, otherUser, [{ expected: 'blanca', submitted: null }], -1)).toEqual([]);
    expect(await findTier3Candidates(pool, otherUser, FAKE_CARD_ID, -1)).toEqual([]);
    expect(await findTier4Candidates(pool, otherUser, 'agreement', -1, 50)).toEqual([]);
    await upsertPracticeSession(pool, {
      reviewCategorizationId: id,
      model: 'm',
      generatedAt: new Date().toISOString(),
      examples: [],
      sentences: [],
    });
    expect(await getPracticeSession(pool, otherUser, id)).toBeNull();
    expect(await getPracticeSession(pool, testUserId, id)).not.toBeNull();
  });
});
