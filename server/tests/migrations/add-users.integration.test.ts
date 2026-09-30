import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, '../../migrations');
const SCRATCH_DB = 'spanish_cards_migration_test';
const PREVIOUS = '1779000000000_add-prompt-version-to-answer-checks';
const DATA_TABLES = [
  'answer_checks', 'card_alternate_answers', 'card_schedules', 'cards', 'explanations',
  'practice_sessions', 'practice_targets', 'review_categorizations', 'review_history', 'reviews',
];

const devUrl = loadConfig().databaseUrl;
const scratchUrl = (() => {
  const url = new URL(devUrl);
  url.pathname = `/${SCRATCH_DB}`;
  return url.toString();
})();

let admin: pg.Client;
let db: pg.Client;

function migrate(
  direction: 'up' | 'down',
  extra: { file?: string; count?: number; timestamp?: boolean } = {},
) {
  return runner({
    databaseUrl: scratchUrl,
    dir: MIGRATIONS_DIR,
    direction,
    migrationsTable: 'pgmigrations',
    log: () => undefined,
    ...extra,
  });
}

async function counts(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of DATA_TABLES) {
    const { rows } = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
    result[table] = rows[0]!.count;
  }
  return result;
}

async function hasIdColumn(table: string): Promise<boolean> {
  const { rows } = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id'
     ) AS exists`,
    [table],
  );
  return rows[0]!.exists;
}

// A content hash per table, excluding user_id, so we can confirm the
// migration only adds ownership and never touches any other column or row.
// Ordered by id where the table has one; card_schedules (keyed on card_id)
// falls back to ordering by the row's own text.
async function dataDigest(table: string): Promise<string> {
  const orderBy = (await hasIdColumn(table))
    ? `(to_jsonb(t)->>'id')::bigint`
    : `(to_jsonb(t) - 'user_id')::text`;
  const { rows } = await db.query<{ digest: string }>(
    `SELECT coalesce(md5(string_agg((to_jsonb(t) - 'user_id')::text, ',' ORDER BY ${orderBy})), '') AS digest
     FROM ${table} t`,
  );
  return rows[0]!.digest;
}

async function dataDigests(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const table of DATA_TABLES) {
    result[table] = await dataDigest(table);
  }
  return result;
}

async function seedPreUsersData() {
  const card = await db.query<{ id: number }>(
    `INSERT INTO cards (spanish_text, english_text) VALUES ('gato', 'cat'), ('perro', 'dog') RETURNING id`,
  );
  const cardId = card.rows[0]!.id;
  await db.query(
    `INSERT INTO card_schedules (card_id, due, stability, difficulty, elapsed_days, scheduled_days,
       learning_steps, reps, lapses, state) VALUES ($1, now(), 1, 5, 0, 1, 0, 1, 0, 2)`,
    [cardId],
  );
  await db.query(
    `INSERT INTO reviews (card_id, direction, detected_correct, rating, was_due)
     VALUES ($1, 'spanish-to-english', true, 'good', true)`,
    [cardId],
  );
  await db.query(
    `INSERT INTO card_alternate_answers (card_id, field, text, position) VALUES ($1, 'english', 'kitty', 0)`,
    [cardId],
  );
  const history = await db.query<{ id: number }>(
    `INSERT INTO review_history (card_id, direction, verdict, rating, correct_text, submitted_text)
     VALUES ($1, 'spanish-to-english', 'incorrect', 'again', 'cat', 'dog') RETURNING id`,
    [cardId],
  );
  const categorization = await db.query<{ id: number }>(
    `INSERT INTO review_categorizations (review_history_id, category, rationale, model)
     VALUES ($1, 'vocabulary', 'r', 'm') RETURNING id`,
    [history.rows[0]!.id],
  );
  await db.query(
    `INSERT INTO practice_targets (review_categorization_id, expected, submitted) VALUES ($1, 'cat', 'dog')`,
    [categorization.rows[0]!.id],
  );
  await db.query(
    `INSERT INTO practice_sessions (review_categorization_id, model, generated_at, examples_snapshot, sentences)
     VALUES ($1, 'm', now(), '[]', '[]')`,
    [categorization.rows[0]!.id],
  );
  await db.query(
    `INSERT INTO explanations (spanish_text, english_text, content_markdown, model) VALUES ('gato', 'cat', 'x', 'm')`,
  );
  await db.query(
    `INSERT INTO answer_checks (spanish_text, english_text, direction, submitted_normalized, verdict, critique_markdown, model)
     VALUES ('gato', 'cat', 'spanish-to-english', 'kitty', 'valid', 'x', 'm')`,
  );
}

beforeAll(async () => {
  admin = new pg.Client({ connectionString: devUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${SCRATCH_DB}`);
  // `file` runs only that one migration in node-pg-migrate 7.9.1, not
  // everything up to it; `timestamp` + `count` runs through it instead.
  await migrate('up', { timestamp: true, count: Number(PREVIOUS.split('_')[0]) });
  db = new pg.Client({ connectionString: scratchUrl });
  await db.connect();
  await seedPreUsersData();
}, 60_000);

afterAll(async () => {
  await db?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  await admin.end();
});

describe('add-users migration', () => {
  it('preserves every row, assigns all root rows to the owner, and leaves them otherwise untouched', async () => {
    const before = await counts();
    const digestsBefore = await dataDigests();

    await migrate('up');

    expect(await counts()).toEqual(before);
    expect(await dataDigests()).toEqual(digestsBefore);
    const owner = await db.query<{ id: number; password_hash: string | null; session_version: number }>(
      `SELECT id, password_hash, session_version FROM users WHERE email = 'scatchell@gmail.com'`,
    );
    expect(owner.rows).toHaveLength(1);
    expect(owner.rows[0]!.password_hash).toBeNull();
    const ownerId = owner.rows[0]!.id;
    for (const table of ['cards', 'review_history']) {
      const { rows } = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ${table} WHERE user_id IS DISTINCT FROM $1`,
        [ownerId],
      );
      expect(rows[0]!.count).toBe(0);
    }
  });

  it('rejects rows without an owner and emails that are not normalized', async () => {
    await expect(
      db.query(`INSERT INTO cards (spanish_text, english_text) VALUES ('a', 'b')`),
    ).rejects.toThrow(/user_id/);
    await expect(db.query(`INSERT INTO users (email) VALUES ('Mixed@Case.com')`)).rejects.toThrow(/users_email_normalized/);
  });

  it('refuses to delete a user who still owns data', async () => {
    await expect(db.query(`DELETE FROM users WHERE email = 'scatchell@gmail.com'`)).rejects.toThrow(/foreign key/);
  });

  it('down refuses while more than one user exists, and succeeds (keeping rows) with one', async () => {
    const before = await counts();
    const digestsBefore = await dataDigests();
    await db.query(`INSERT INTO users (email) VALUES ('second@example.com')`);
    await expect(migrate('down', { count: 1 })).rejects.toThrow(/more than one user/);
    await db.query(`DELETE FROM users WHERE email = 'second@example.com'`);
    await migrate('down', { count: 1 });
    expect(await counts()).toEqual(before);
    expect(await dataDigests()).toEqual(digestsBefore);
    const { rows } = await db.query(`SELECT to_regclass('public.users') AS t`);
    expect(rows[0].t).toBeNull();
  });
});
