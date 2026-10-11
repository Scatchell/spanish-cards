import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { insertCards } from '../../src/cards/repository.js';
import { countDeckBuckets, getAllReviews } from '../../src/progress/repository.js';
import { countDueCards, getTrainingQueue, insertReview } from '../../src/training/repository.js';
import { recordReview, recordReviewBatch } from '../../src/training/service.js';
import { ensureTestUser } from '../helpers/test-users.js';

let pool: DbPool;
let alice: number;
let bob: number;
const FAR_FUTURE = new Date('2100-01-01T00:00:00Z');

beforeAll(async () => {
  pool = createPool(loadConfig().databaseUrl);
  alice = await ensureTestUser(pool, 'training-alice@example.com');
  bob = await ensureTestUser(pool, 'training-bob@example.com');
});
afterAll(async () => {
  await pool.query('DELETE FROM review_history WHERE user_id = ANY($1)', [[alice, bob]]);
  await pool.query('DELETE FROM cards WHERE user_id = ANY($1)', [[alice, bob]]);
  await pool.end();
});

describe('training and progress scoping', () => {
  it('queues, counts, and records reviews per user; a foreign card id is "not found"', async () => {
    const [aliceCard] = await insertCards(pool, alice, [{ spanishText: 'sol', englishText: 'sun' }]);
    const [bobCard] = await insertCards(pool, bob, [{ spanishText: 'luna', englishText: 'moon' }]);

    expect((await getTrainingQueue(pool, alice, 'due', FAR_FUTURE)).map((c) => c.id)).toEqual([aliceCard!.id]);
    expect(await countDueCards(pool, alice, FAR_FUTURE)).toBe(1);
    expect((await countDeckBuckets(pool, alice, 21)).reduce((n, r) => n + r.count, 0)).toBe(1);

    const request = {
      cardId: bobCard!.id, rating: 'good', direction: 'spanish-to-english', verdict: 'correct',
      submittedText: 'moon', matchedText: 'moon',
    } as Parameters<typeof recordReview>[2];
    expect(await recordReview(pool, alice, request, new Date())).toBeNull();
    expect(await getAllReviews(pool, bob)).toEqual([]);

    await recordReview(pool, alice, { ...request, cardId: aliceCard!.id, submittedText: 'sun', matchedText: 'sun' }, new Date());
    expect(await getAllReviews(pool, alice)).toHaveLength(1);
    expect(await getAllReviews(pool, bob)).toEqual([]);
    const history = await pool.query('SELECT user_id FROM review_history WHERE card_id = $1', [aliceCard!.id]);
    expect(history.rows).toEqual([{ user_id: alice }]);
    expect((await countDeckBuckets(pool, bob, 21)).reduce((n, r) => n + r.count, 0)).toBe(1);
  });
});

describe('insertReview idempotency', () => {
  it('ignores a repeated (card, clientReviewId) and reports it; null ids never conflict', async () => {
    const [card] = await insertCards(pool, alice, [{ spanishText: 'mar', englishText: 'sea' }]);
    const review = {
      cardId: card!.id,
      direction: 'spanish-to-english' as const,
      detectedCorrect: true,
      rating: 'good' as const,
      wasDue: true,
      reviewedAt: new Date('2026-01-01T00:00:00Z'),
      clientReviewId: '3f8f6f0e-5b7a-4a52-9d4e-0f2f6a1c9b11',
    };

    expect(await insertReview(pool, review)).toBe(true);
    expect(await insertReview(pool, review)).toBe(false);
    expect(await insertReview(pool, { ...review, clientReviewId: null })).toBe(true);
    expect(await insertReview(pool, { ...review, clientReviewId: null })).toBe(true);

    const rows = await pool.query('SELECT 1 FROM reviews WHERE card_id = $1', [card!.id]);
    expect(rows.rowCount).toBe(3);
  });
});

describe('recordReviewBatch against Postgres', () => {
  const ID_1 = '11111111-1111-4111-8111-111111111111';
  const ID_2 = '22222222-2222-4222-8222-222222222222';
  const ID_3 = '33333333-3333-4333-8333-333333333333';

  function entry(cardId: number, id: string, reviewedAt: string) {
    return {
      clientReviewId: id,
      item: {
        clientReviewId: id,
        reviewedAt: new Date(reviewedAt),
        request: {
          cardId,
          rating: 'good' as const,
          direction: 'spanish-to-english' as const,
          verdict: 'correct' as const,
          submittedText: 'x',
          matchedText: 'x',
        },
      },
    };
  }

  it('applies once, treats a lost-response retry as duplicate, drops foreign cards, and tolerates a bad item', async () => {
    const [mine] = await insertCards(pool, alice, [{ spanishText: 'rio', englishText: 'river' }]);
    const [theirs] = await insertCards(pool, bob, [{ spanishText: 'lago', englishText: 'lake' }]);
    const now = new Date('2026-03-10T12:00:00Z');
    const batch = [
      entry(mine!.id, ID_1, '2026-03-10T10:00:00Z'),
      entry(theirs!.id, ID_2, '2026-03-10T10:01:00Z'),
      { clientReviewId: ID_3, item: null },
    ];

    const first = await recordReviewBatch(pool, alice, batch, now);
    expect(first.map((r) => r.status)).toEqual(['applied', 'cardNotFound', 'invalid']);

    const second = await recordReviewBatch(pool, alice, batch, now);
    expect(second.map((r) => r.status)).toEqual(['duplicate', 'cardNotFound', 'invalid']);

    const schedule = await pool.query('SELECT reps FROM card_schedules WHERE card_id = $1', [mine!.id]);
    expect(schedule.rows).toEqual([{ reps: 1 }]);
    const reviews = await pool.query('SELECT reviewed_at FROM reviews WHERE card_id = $1', [mine!.id]);
    expect(reviews.rows).toHaveLength(1);
    expect(reviews.rows[0].reviewed_at).toEqual(new Date('2026-03-10T10:00:00Z'));
    const history = await pool.query('SELECT 1 FROM review_history WHERE card_id = $1', [mine!.id]);
    expect(history.rowCount).toBe(1);
  });
});
