import { State } from 'ts-fsrs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertCards } from '../../src/cards/repository.js';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { countDeckBuckets, getCardCreatedAts } from '../../src/progress/repository.js';
import { ensureTestUser } from '../helpers/test-users.js';

// Real dev Postgres; do not run alongside `pnpm dev` (see AGENTS.md).
let pool: DbPool;
let userId: number;
let otherUserId: number;

async function addScheduledCard(text: string, state: number, stability: number): Promise<void> {
  const [card] = await insertCards(pool, userId, [{ spanishText: text, englishText: `${text} en` }]);
  await pool.query(
    `INSERT INTO card_schedules
       (card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state)
     VALUES ($1, now(), $2, 5, 0, 0, 0, 1, 0, $3)`,
    [card!.id, stability, state],
  );
}

beforeAll(async () => {
  pool = createPool(loadConfig().databaseUrl);
  userId = await ensureTestUser(pool, 'progress-repo@example.com');
  otherUserId = await ensureTestUser(pool, 'progress-repo-other@example.com');
});

beforeEach(async () => {
  await pool.query('DELETE FROM cards WHERE user_id = ANY($1)', [[userId, otherUserId]]);
});

afterAll(async () => {
  await pool.query('DELETE FROM cards WHERE user_id = ANY($1)', [[userId, otherUserId]]);
  await pool.end();
});

describe('getCardCreatedAts', () => {
  it("returns only the user's cards' creation times", async () => {
    await insertCards(pool, userId, [{ spanishText: 'uno', englishText: 'one' }]);
    await insertCards(pool, otherUserId, [{ spanishText: 'dos', englishText: 'two' }]);
    const created = await getCardCreatedAts(pool, userId);
    expect(created).toHaveLength(1);
    expect(created[0]).toBeInstanceOf(Date);
  });
});

describe('countDeckBuckets', () => {
  const countFor = (rows: { state: number | null; durable: boolean; count: number }[], state: number | null, durable: boolean) =>
    rows.find((r) => r.state === state && r.durable === durable)?.count ?? 0;

  it('counts never-reviewed cards under a null state', async () => {
    await insertCards(pool, userId, [{ spanishText: 'tres', englishText: 'three' }]);
    const rows = await countDeckBuckets(pool, userId, 21);
    expect(countFor(rows, null, false)).toBe(1);
  });

  it('treats stability exactly at the threshold as durable and just below as not', async () => {
    await addScheduledCard('a', State.Review, 21);
    await addScheduledCard('b', State.Review, 20.99);
    await addScheduledCard('c', State.Relearning, 3);
    const rows = await countDeckBuckets(pool, userId, 21);
    expect(countFor(rows, State.Review, true)).toBe(1);
    expect(countFor(rows, State.Review, false)).toBe(1);
    expect(countFor(rows, State.Relearning, false)).toBe(1);
  });

  it("ignores other users' cards", async () => {
    await insertCards(pool, otherUserId, [{ spanishText: 'cuatro', englishText: 'four' }]);
    expect(await countDeckBuckets(pool, userId, 21)).toEqual([]);
  });
});
