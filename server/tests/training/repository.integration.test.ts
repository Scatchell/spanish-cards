import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { insertCards } from '../../src/cards/repository.js';
import { countCards, countCardsByState, getAllReviews } from '../../src/progress/repository.js';
import { countDueCards, getTrainingQueue } from '../../src/training/repository.js';
import { recordReview } from '../../src/training/service.js';
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
    expect(await countCards(pool, alice)).toBe(1);

    const request = {
      cardId: bobCard!.id, rating: 'good', direction: 'spanish-to-english', verdict: 'correct',
      submittedText: 'moon', matchedText: 'moon',
    } as Parameters<typeof recordReview>[2];
    expect(await recordReview(pool, alice, request, new Date())).toBeNull();
    expect(await getAllReviews(pool, bob)).toEqual([]);

    await recordReview(pool, alice, { ...request, cardId: aliceCard!.id, submittedText: 'sun', matchedText: 'sun' }, new Date());
    expect((await getAllReviews(pool, alice)).map((r) => r.cardId)).toEqual([aliceCard!.id]);
    expect(await getAllReviews(pool, bob)).toEqual([]);
    const history = await pool.query('SELECT user_id FROM review_history WHERE card_id = $1', [aliceCard!.id]);
    expect(history.rows).toEqual([{ user_id: alice }]);
    expect((await countCardsByState(pool, bob)).reduce((n, r) => n + r.count, 0)).toBe(1);
  });
});
