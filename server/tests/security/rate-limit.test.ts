import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { authRoutes } from '../../src/auth/routes.js';
import { loginLimiter } from '../../src/security/rate-limit.js';
import type { AppConfig } from '../../src/config.js';

const CONFIG = {
  appUsername: 'admin',
  appPassword: 's3cret',
  sessionSecret: 'test-secret',
  sessionTtlMs: 60_000,
  isProduction: false,
} as AppConfig;

const servers: http.Server[] = [];

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

async function startServer(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/login', loginLimiter);
  app.use('/api', authRoutes(CONFIG));
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/login`;
}

// The limiter is a module-level singleton with a shared store, so each test
// uses a distinct CF-Connecting-IP to get its own bucket (this also exercises
// the real key source: Cloudflare's forwarded client IP).
function login(url: string, clientIp: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': clientIp },
    body: JSON.stringify(body),
  });
}

describe('loginLimiter', () => {
  it('returns 429 after 10 failed attempts, leaving earlier ones as 401', async () => {
    const url = await startServer();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await login(url, '203.0.113.1', { username: 'admin', password: 'wrong' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
  });

  it('does not count successful logins against the limit', async () => {
    const url = await startServer();
    // Twelve correct logins — skipSuccessfulRequests means none consume budget.
    for (let i = 0; i < 12; i++) {
      const res = await login(url, '203.0.113.2', { username: 'admin', password: 's3cret' });
      expect(res.status).toBe(200);
    }
  });

  it('isolates limits per client IP', async () => {
    const url = await startServer();
    for (let i = 0; i < 10; i++) {
      await login(url, '203.0.113.3', { username: 'admin', password: 'wrong' });
    }
    // A different IP is unaffected by the first IP exhausting its budget.
    const other = await login(url, '203.0.113.4', { username: 'admin', password: 'wrong' });
    expect(other.status).toBe(401);
  });
});
