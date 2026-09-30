import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config.js';
import { SESSION_COOKIE, getUserId, requireAuth } from '../../src/auth/middleware.js';
import { createSessionToken } from '../../src/auth/session-token.js';

const CONFIG = { sessionSecret: 's', sessionTtlMs: 30 * 86_400_000, isProduction: false } as AppConfig;
const servers: http.Server[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function start(users: Record<number, number>): Promise<string> {
  const app = express();
  app.use(cookieParser());
  app.use(requireAuth(CONFIG, async (id) => (id in users ? { id, sessionVersion: users[id]! } : null)));
  app.get('/whoami', (req, res) => res.json({ userId: getUserId(req) }));
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/whoami`;
}

function cookieFor(userId: number, sessionVersion: number, issuedAgoMs = 0): string {
  const expiresAtMs = Date.now() - issuedAgoMs + CONFIG.sessionTtlMs;
  return `${SESSION_COOKIE}=${createSessionToken({ userId, sessionVersion, expiresAtMs }, CONFIG.sessionSecret)}`;
}

describe('requireAuth', () => {
  it('401s without a cookie', async () => {
    expect((await fetch(await start({ 1: 0 }))).status).toBe(401);
  });

  it('sets req.userId for a valid cookie whose version matches', async () => {
    const res = await fetch(await start({ 1: 2 }), { headers: { cookie: cookieFor(1, 2) } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 1 });
  });

  it('401s when the session version was bumped (password changed elsewhere)', async () => {
    const res = await fetch(await start({ 1: 3 }), { headers: { cookie: cookieFor(1, 2) } });
    expect(res.status).toBe(401);
  });

  it('401s when the user no longer exists', async () => {
    const res = await fetch(await start({}), { headers: { cookie: cookieFor(9, 0) } });
    expect(res.status).toBe(401);
  });

  it('re-issues the cookie only once it is more than a day old', async () => {
    const url = await start({ 1: 0 });
    const fresh = await fetch(url, { headers: { cookie: cookieFor(1, 0, 60_000) } });
    expect(fresh.headers.get('set-cookie')).toBeNull();
    const old = await fetch(url, { headers: { cookie: cookieFor(1, 0, 2 * 86_400_000) } });
    expect(old.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=1.0.`);
  });
});
