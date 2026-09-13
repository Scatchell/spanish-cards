import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { practiceRoutes } from '../../src/practice/routes.js';
import type { PracticeSentenceGenerator } from '../../src/practice/generator.js';

// Exercises practiceRoutes' default `deps` wiring (repository -> selector ->
// service -> generator) against real dev Postgres, unlike routes.test.ts
// which always overrides `deps`. Same caveat as the other
// *.integration.test.ts files in this repo: do not run alongside `pnpm dev`.
const MARKER = '__practice_routes_integration_test__';
const FAKE_CARD_ID = -999995;

let pool: DbPool;
const servers: http.Server[] = [];

async function cleanup() {
  await pool.query('DELETE FROM review_history WHERE submitted_text LIKE $1', [`${MARKER}%`]);
}

async function insertMistake(): Promise<number> {
  const historyResult = await pool.query<{ id: number }>(
    `INSERT INTO review_history (card_id, direction, verdict, rating, correct_text, submitted_text)
     VALUES ($1, 'english-to-spanish', 'incorrect', 'again', $2, $3)
     RETURNING id`,
    [FAKE_CARD_ID, 'la casa blanca', `${MARKER} routes`],
  );
  const historyRow = historyResult.rows[0];
  if (!historyRow) throw new Error('Insert did not return an id');
  const categorizationResult = await pool.query<{ id: number }>(
    `INSERT INTO review_categorizations (review_history_id, category, rationale, model)
     VALUES ($1, 'agreement', 'test rationale', 'gpt-5.4-mini')
     RETURNING id`,
    [historyRow.id],
  );
  const categorizationRow = categorizationResult.rows[0];
  if (!categorizationRow) throw new Error('Insert did not return an id');
  return categorizationRow.id;
}

const fakeGenerator: PracticeSentenceGenerator = async () =>
  Array.from({ length: 10 }, (_, i) => ({ spanish: `s${i}`, english: `e${i}` }));

async function startServer(): Promise<string> {
  const app = express();
  app.use('/api/practice', practiceRoutes(pool, fakeGenerator));
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/practice`;
}

beforeAll(() => {
  pool = createPool(loadConfig().databaseUrl);
});

beforeEach(async () => {
  await cleanup();
});

afterEach(
  () =>
    new Promise<void>((resolve) => {
      const toClose = servers.splice(0);
      if (toClose.length === 0) {
        resolve();
        return;
      }
      let remaining = toClose.length;
      for (const s of toClose) {
        s.close(() => {
          if (--remaining === 0) resolve();
        });
      }
    }),
);

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('practiceRoutes default deps wiring', () => {
  it('404s before generation, then 200s with a persisted 10-sentence session after POST', async () => {
    const id = await insertMistake();
    const base = await startServer();

    const before = await fetch(`${base}/${id}`);
    expect(before.status).toBe(404);

    const posted = await fetch(`${base}/${id}`, { method: 'POST' });
    expect(posted.status).toBe(200);
    const postedBody = (await posted.json()) as { session: { sentences: unknown[] } };
    expect(postedBody.session.sentences).toHaveLength(10);

    const after = await fetch(`${base}/${id}`);
    expect(after.status).toBe(200);
    const afterBody = (await after.json()) as { session: { sentences: unknown[] } };
    expect(afterBody.session.sentences).toEqual(postedBody.session.sentences);
  });
});
