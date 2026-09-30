import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { deleteCard, getCard, insertCards, listCards, updateCard } from '../../src/cards/repository.js';
import { ensureTestUser } from '../helpers/test-users.js';

let pool: DbPool;
let alice: number;
let bob: number;

beforeAll(async () => {
  pool = createPool(loadConfig().databaseUrl);
  alice = await ensureTestUser(pool, 'cards-alice@example.com');
  bob = await ensureTestUser(pool, 'cards-bob@example.com');
});
afterAll(async () => {
  await pool.query('DELETE FROM cards WHERE user_id = ANY($1)', [[alice, bob]]);
  await pool.end();
});

describe('card ownership', () => {
  it("lists, reads, updates, and deletes only the owner's cards", async () => {
    const [aliceCard] = await insertCards(pool, alice, [{ spanishText: 'uno', englishText: 'one' }]);
    const [bobCard] = await insertCards(pool, bob, [{ spanishText: 'dos', englishText: 'two' }]);
    expect((await listCards(pool, alice)).map((c) => c.id)).toEqual([aliceCard!.id]);
    expect(await getCard(pool, alice, bobCard!.id)).toBeNull();
    expect(await updateCard(pool, alice, bobCard!.id, { spanishText: 'x', englishText: 'y' })).toBeNull();
    expect(await deleteCard(pool, alice, bobCard!.id)).toBe(false);
    expect((await getCard(pool, bob, bobCard!.id))?.spanishText).toBe('dos');
  });
});
