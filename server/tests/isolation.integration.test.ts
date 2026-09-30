import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import type { DbPool } from '../src/db.js';
import type { PracticeSentenceGenerator } from '../src/practice/generator.js';
import { upsertPracticeSession } from '../src/practice/repository.js';
import { practiceRoutes } from '../src/practice/routes.js';
import { asUser } from './helpers/as-user.js';
import { ensureTestUser } from './helpers/test-users.js';

const PASSWORD = 'isolation-pass-1';
const config = { ...loadConfig(), openaiSecretKey: null };
let pool: DbPool;
let server: http.Server;
let base: string;
const ids: Record<'a' | 'b', number> = { a: 0, b: 0 };
const cookies: Record<'a' | 'b', string> = { a: '', b: '' };
const extraServers: http.Server[] = [];

async function api(who: 'a' | 'b', method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: cookies[who] },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function closeServer(s: http.Server): Promise<void> {
  return new Promise((resolve) => s.close(() => resolve()));
}

async function wipeUserData(): Promise<void> {
  await pool.query('DELETE FROM review_history WHERE user_id = ANY($1)', [[ids.a, ids.b]]);
  await pool.query('DELETE FROM cards WHERE user_id = ANY($1)', [[ids.a, ids.b]]);
}

beforeAll(async () => {
  process.env.DISABLE_RATE_LIMITS = 'true';
  pool = createPool(config.databaseUrl);
  const hash = await hashPassword(PASSWORD);
  for (const who of ['a', 'b'] as const) {
    ids[who] = await ensureTestUser(pool, `isolation-${who}@example.com`);
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [ids[who], hash]);
  }
  // A previous run killed mid-suite would otherwise leave this run permanently red.
  await wipeUserData();
  server = await new Promise((resolve) => {
    const s = createApp(config, pool).listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const who of ['a', 'b'] as const) {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `isolation-${who}@example.com`, password: PASSWORD }),
    });
    cookies[who] = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  }
});

afterAll(async () => {
  await closeServer(server);
  await Promise.all(extraServers.splice(0).map(closeServer));
  await wipeUserData();
  await pool.end();
});

describe('cross-user isolation (full app)', () => {
  it('B cannot see, change, train, or explain A\'s cards; A\'s data is intact', async () => {
    const created = await api('a', 'POST', '/api/cards/batch', { cards: [{ spanishText: 'rojo', englishText: 'red' }] });
    const cardId = created.body.saved[0].id as number;
    const alt = await api('a', 'POST', `/api/cards/${cardId}/alternates`, { field: 'english', text: 'crimson' });
    const altId = alt.body.alternate.id as number;

    // A freshly created card is due immediately, so it's in A's queue right away.
    const aQueueBefore = (await api('a', 'GET', '/api/training/queue')).body.cards;
    expect(aQueueBefore.map((c: { id: number }) => c.id)).toContain(cardId);

    await api('a', 'POST', '/api/training/reviews', {
      cardId, rating: 'again', direction: 'spanish-to-english', verdict: 'incorrect', submittedText: 'blue', matchedText: 'red',
    });

    expect((await api('b', 'GET', '/api/cards')).body.cards).toEqual([]);
    expect((await api('b', 'GET', '/api/training/queue')).body.cards).toEqual([]);
    const progress = (await api('b', 'GET', '/api/progress')).body;
    expect(progress.totalCards).toBe(0);
    expect(progress.dueNow).toBe(0);

    expect(await api('b', 'PATCH', `/api/cards/${cardId}`, { spanishText: 'x', englishText: 'y' })).toMatchObject({
      status: 404,
      body: { error: 'Card not found' },
    });
    expect(await api('b', 'DELETE', `/api/cards/${cardId}`)).toMatchObject({ status: 404, body: { error: 'Card not found' } });
    expect(
      await api('b', 'POST', `/api/cards/${cardId}/alternates`, { field: 'english', text: 'scarlet' }),
    ).toMatchObject({ status: 404, body: { error: 'Card not found' } });
    expect(
      await api('b', 'PATCH', `/api/cards/${cardId}/alternates/${altId}`, { text: 'scarlet' }),
    ).toMatchObject({ status: 404, body: { error: 'Alternate not found' } });
    expect(await api('b', 'DELETE', `/api/cards/${cardId}/alternates/${altId}`)).toMatchObject({
      status: 404,
      body: { error: 'Alternate not found' },
    });
    expect(
      await api('b', 'POST', '/api/training/reviews', {
        cardId, rating: 'easy', direction: 'spanish-to-english', verdict: 'correct', submittedText: 'red', matchedText: 'red',
      }),
    ).toMatchObject({ status: 404, body: { error: 'Card not found' } });
    expect(await api('b', 'POST', `/api/cards/${cardId}/explanation`, {})).toMatchObject({
      status: 404,
      body: { error: 'Card not found' },
    });
    expect(
      await api('b', 'POST', `/api/cards/${cardId}/explanation/follow-up`, {
        question: 'why?',
        explanationMarkdown: 'because',
      }),
    ).toMatchObject({ status: 404, body: { error: 'Card not found' } });
    expect(
      await api('b', 'POST', `/api/cards/${cardId}/explanation/answer-check`, {
        submittedAnswer: 'red',
        direction: 'spanish-to-english',
      }),
    ).toMatchObject({ status: 404, body: { error: 'Card not found' } });

    // Owner control: A's own call reaches the unconfigured generator (502), a
    // response the app's 404 catch-all for an unmounted route could never give.
    expect(await api('a', 'POST', `/api/cards/${cardId}/explanation`, {})).toMatchObject({
      status: 502,
      body: { error: 'Explanation generation is not configured' },
    });
    expect(
      await api('a', 'POST', `/api/cards/${cardId}/explanation/follow-up`, {
        question: 'why?',
        explanationMarkdown: 'because',
      }),
    ).toMatchObject({ status: 502, body: { error: 'Explanation generation is not configured' } });
    expect(
      await api('a', 'POST', `/api/cards/${cardId}/explanation/answer-check`, {
        submittedAnswer: 'red',
        direction: 'spanish-to-english',
      }),
    ).toMatchObject({ status: 502, body: { error: 'Answer check is not configured' } });

    const aCards = (await api('a', 'GET', '/api/cards')).body.cards;
    expect(aCards).toHaveLength(1);
    expect(aCards[0].spanishText).toBe('rojo');
    expect(aCards[0].englishAlternates.map((x: { text: string }) => x.text)).toEqual(['crimson']);
    expect((await api('a', 'GET', '/api/progress')).body.totalCards).toBe(1);
  });

  it('B cannot see, fetch, or generate A\'s practice session for a mistake', async () => {
    const history = await pool.query<{ id: number }>(
      `INSERT INTO review_history (user_id, card_id, direction, verdict, rating, correct_text, submitted_text)
       VALUES ($1, -1, 'spanish-to-english', 'incorrect', 'again', 'red', 'blue') RETURNING id`,
      [ids.a],
    );
    const cat = await pool.query<{ id: number }>(
      `INSERT INTO review_categorizations (review_history_id, category, rationale, model)
       VALUES ($1, 'vocabulary', 'r', 'm') RETURNING id`,
      [history.rows[0]!.id],
    );
    const categorizationId = cat.rows[0]!.id;

    const aSummary = (await api('a', 'GET', '/api/categorization/summary')).body.categories;
    const bSummary = (await api('b', 'GET', '/api/categorization/summary')).body.categories;
    expect(aSummary.find((c: { category: string }) => c.category === 'vocabulary').count).toBeGreaterThan(0);
    expect(bSummary.every((c: { count: number }) => c.count === 0)).toBe(true);

    const aMistakes = (await api('a', 'GET', '/api/categorization/mistakes?category=vocabulary')).body.items;
    expect(aMistakes.map((m: { id: number }) => m.id)).toContain(categorizationId);
    expect((await api('b', 'GET', '/api/categorization/mistakes?category=vocabulary')).body.items).toEqual([]);

    await upsertPracticeSession(pool, {
      reviewCategorizationId: categorizationId,
      model: 'test-model',
      generatedAt: new Date().toISOString(),
      examples: [],
      sentences: [{ spanish: 'seed-es', english: 'seed-en' }],
    });

    const aSession = await api('a', 'GET', `/api/practice/${categorizationId}`);
    expect(aSession.status).toBe(200);
    expect(aSession.body.session.reviewCategorizationId).toBe(categorizationId);
    expect(await api('b', 'GET', `/api/practice/${categorizationId}`)).toMatchObject({
      status: 404,
      body: { error: 'No practice session yet' },
    });

    // With openaiSecretKey null, POST /api/practice/:id 503s as 'unavailable'
    // before the full app ever reaches ownership, so exercise it directly:
    // practiceRoutes with a fake generator, one instance per user (as in
    // tests/practice/routes.integration.test.ts).
    let generatorCalls = 0;
    const fakeGenerator: PracticeSentenceGenerator = async () => {
      generatorCalls += 1;
      return [{ spanish: 'gen-es', english: 'gen-en' }];
    };

    const bApp = express();
    bApp.use(express.json());
    bApp.use(asUser(ids.b));
    bApp.use('/api/practice', practiceRoutes(pool, fakeGenerator));
    const bServer: http.Server = await new Promise((resolve) => {
      const s = bApp.listen(0, '127.0.0.1', () => resolve(s));
    });
    extraServers.push(bServer);
    const bBase = `http://127.0.0.1:${(bServer.address() as AddressInfo).port}/api/practice`;
    const bPost = await fetch(`${bBase}/${categorizationId}`, { method: 'POST' });
    expect(bPost.status).toBe(404);
    expect(generatorCalls).toBe(0);

    const aApp = express();
    aApp.use(express.json());
    aApp.use(asUser(ids.a));
    aApp.use('/api/practice', practiceRoutes(pool, fakeGenerator));
    const aServer: http.Server = await new Promise((resolve) => {
      const s = aApp.listen(0, '127.0.0.1', () => resolve(s));
    });
    extraServers.push(aServer);
    const aBase = `http://127.0.0.1:${(aServer.address() as AddressInfo).port}/api/practice`;
    const aPost = await fetch(`${aBase}/${categorizationId}`, { method: 'POST' });
    expect(aPost.status).toBe(200);
    expect(generatorCalls).toBe(1);
  });

  it('/api/me reports each session\'s own email', async () => {
    expect((await api('a', 'GET', '/api/me')).body).toEqual({ email: 'isolation-a@example.com' });
    expect((await api('b', 'GET', '/api/me')).body).toEqual({ email: 'isolation-b@example.com' });
  });

  it('MCP list_cards (full chain over /mcp) returns only the configured user\'s cards', async () => {
    const mcpToken = 'isolation-mcp-token';
    const mcpConfig = { ...config, mcpUserEmail: 'isolation-a@example.com', mcpToken };
    const mcpServer: http.Server = await new Promise((resolve) => {
      const s = createApp(mcpConfig, pool).listen(0, '127.0.0.1', () => resolve(s));
    });
    extraServers.push(mcpServer);
    const mcpBase = `http://127.0.0.1:${(mcpServer.address() as AddressInfo).port}`;

    await api('a', 'POST', '/api/cards/batch', { cards: [{ spanishText: 'mcp-a-card', englishText: 'mcp a card' }] });
    await api('b', 'POST', '/api/cards/batch', { cards: [{ spanishText: 'mcp-b-card', englishText: 'mcp b card' }] });

    const client = new Client({ name: 'isolation-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${mcpBase}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${mcpToken}` } },
    });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: 'list_cards', arguments: {} });
      const payload = result.structuredContent as { cards: { spanish_text: string }[] };
      const spanishTexts = payload.cards.map((c) => c.spanish_text);
      expect(spanishTexts).toContain('mcp-a-card');
      expect(spanishTexts).not.toContain('mcp-b-card');
    } finally {
      await client.close().catch(() => {});
    }
  });
});
