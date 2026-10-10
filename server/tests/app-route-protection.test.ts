import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { DbPool } from '../src/db.js';

// Unauthenticated requests stop at requireAuth before any query, so a pool
// that throws on use proves nothing protected touched the database.
const POOL = { query: () => { throw new Error('DB must not be reached'); } } as unknown as DbPool;
const CONFIG = {
  port: 0, databaseUrl: '', sessionSecret: 's', sessionTtlMs: 1000, mcpToken: null, mcpUserEmail: null,
  openaiSecretKey: null, openaiBaseUrl: null, isProduction: false, appBaseUrl: 'http://x',
} as AppConfig;

let server: http.Server;
let base: string;
beforeAll(async () => {
  process.env.DISABLE_RATE_LIMITS = 'true';
  server = await new Promise((resolve) => {
    const s = createApp(CONFIG, POOL).listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const PROTECTED: [string, string][] = [
  ['GET', '/api/me'], ['POST', '/api/password'],
  ['GET', '/api/cards'], ['POST', '/api/cards/batch'], ['PATCH', '/api/cards/1'], ['DELETE', '/api/cards/1'],
  ['POST', '/api/cards/1/alternates'], ['POST', '/api/cards/1/explanation'],
  ['GET', '/api/training/queue'], ['POST', '/api/training/reviews'],
  ['GET', '/api/progress'], ['GET', '/api/categorization/summary'], ['GET', '/api/categorization/mistakes'],
  ['GET', '/api/practice/1'], ['POST', '/api/practice/1'],
];

describe('route protection', () => {
  it.each(PROTECTED)('%s %s requires a session', async (method, path) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not authenticated' });
  });

  it('public auth routes answer without a session', async () => {
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post('/api/logout', {})).status).toBe(200);
    expect((await post('/api/set-password/check', {})).status).toBe(404);
    const login = await post('/api/login', {});
    expect(await login.json()).toEqual({ error: 'Invalid email or password' });
  });
});
