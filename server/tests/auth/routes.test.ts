import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config.js';
import { accountRoutes } from '../../src/auth/account-routes.js';
import type { AccountDeps } from '../../src/auth/account-routes.js';
import { SESSION_COOKIE, requireAuth } from '../../src/auth/middleware.js';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';
import { publicAuthRoutes } from '../../src/auth/routes.js';
import type { PublicAuthDeps } from '../../src/auth/routes.js';
import type { UserRecord } from '../../src/users/repository.js';
import { hashSetPasswordToken } from '../../src/users/set-password-token.js';

const CONFIG = { sessionSecret: 's', sessionTtlMs: 30 * 86_400_000, isProduction: false } as AppConfig;
const servers: http.Server[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

let users: UserRecord[];
let tokens: Map<string, number>; // tokenHash -> userId
let knownHash: string;
beforeAll(async () => {
  knownHash = await hashPassword('right-password');
});
// Fresh fixtures per test so mutations don't leak between cases.
beforeEach(() => {
  users = [
    { id: 1, email: 'owner@example.com', passwordHash: knownHash, sessionVersion: 0 },
    { id: 2, email: 'invited@example.com', passwordHash: null, sessionVersion: 0 },
  ];
  tokens = new Map();
});

function fakeDeps(): PublicAuthDeps & AccountDeps {
  return {
    findUserByEmail: async (email) => users.find((u) => u.email === email) ?? null,
    findUserById: async (id) => users.find((u) => u.id === id) ?? null,
    findUserBySetPasswordToken: async (hash) => users.find((u) => u.id === tokens.get(hash)) ?? null,
    completeSetPassword: async (hash, passwordHash) => {
      const user = users.find((u) => u.id === tokens.get(hash));
      if (!user) return null;
      tokens.delete(hash);
      user.passwordHash = passwordHash;
      user.sessionVersion += 1;
      return { ...user };
    },
    updatePassword: async (id, passwordHash) => {
      const user = users.find((u) => u.id === id)!;
      user.passwordHash = passwordHash;
      user.sessionVersion += 1;
      return { ...user };
    },
  };
}

async function start(): Promise<string> {
  const deps = fakeDeps();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', publicAuthRoutes(CONFIG, deps));
  app.use('/api', requireAuth(CONFIG, (id) => deps.findUserById(id)));
  app.use('/api', accountRoutes(CONFIG, deps));
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

function post(url: string, body: unknown, cookie?: string) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function sessionCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0]!;
}

describe('auth routes', () => {
  it('logs in with a normalized email and the right password', async () => {
    const api = await start();
    const res = await post(`${api}/login`, { email: '  OWNER@Example.com ', password: 'right-password' });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toMatch(new RegExp(`^${SESSION_COOKIE}=1\\.0\\.`));
    const me = await fetch(`${api}/me`, { headers: { cookie: sessionCookie(res) } });
    expect(await me.json()).toEqual({ email: 'owner@example.com' });
  });

  it('gives the same generic 401 for wrong password, unknown email, and invited-without-password', async () => {
    const api = await start();
    for (const body of [
      { email: 'owner@example.com', password: 'wrong' },
      { email: 'ghost@example.com', password: 'right-password' },
      { email: 'invited@example.com', password: '' },
      { email: 'invited@example.com', password: 'anything-at-all' },
      {},
    ]) {
      const res = await post(`${api}/login`, body);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Invalid email or password' });
    }
  });

  it('checks and consumes a set-password token exactly once, logging the user in', async () => {
    const api = await start();
    tokens.set(hashSetPasswordToken('tok'), 2);
    expect(await (await post(`${api}/set-password/check`, { token: 'tok' })).json()).toEqual({
      email: 'invited@example.com',
    });
    expect((await post(`${api}/set-password`, { token: 'tok', password: 'short' })).status).toBe(400);
    const ok = await post(`${api}/set-password`, { token: 'tok', password: 'brand-new-pass' });
    expect(ok.status).toBe(200);
    const me = await fetch(`${api}/me`, { headers: { cookie: sessionCookie(ok) } });
    expect(me.status).toBe(200);
    expect((await post(`${api}/set-password`, { token: 'tok', password: 'brand-new-pass' })).status).toBe(404);
    expect((await post(`${api}/set-password/check`, { token: 'tok' })).status).toBe(404);
    expect(await verifyPassword('brand-new-pass', users[1]!.passwordHash!)).toBe(true);
  });

  it('changes password: requires the current one, keeps this device, signs out others', async () => {
    const api = await start();
    const login = await post(`${api}/login`, { email: 'owner@example.com', password: 'right-password' });
    const oldCookie = sessionCookie(login);
    expect((await post(`${api}/password`, { currentPassword: 'nope', newPassword: 'next-password' }, oldCookie)).status).toBe(400);
    const changed = await post(`${api}/password`, { currentPassword: 'right-password', newPassword: 'next-password' }, oldCookie);
    expect(changed.status).toBe(200);
    expect((await fetch(`${api}/me`, { headers: { cookie: sessionCookie(changed) } })).status).toBe(200);
    expect((await fetch(`${api}/me`, { headers: { cookie: oldCookie } })).status).toBe(401);
    expect((await post(`${api}/login`, { email: 'owner@example.com', password: 'right-password' })).status).toBe(401);
    expect((await post(`${api}/login`, { email: 'owner@example.com', password: 'next-password' })).status).toBe(200);
  });

  it('password change and /me require a session', async () => {
    const api = await start();
    expect((await fetch(`${api}/me`)).status).toBe(401);
    expect((await post(`${api}/password`, {})).status).toBe(401);
  });
});
