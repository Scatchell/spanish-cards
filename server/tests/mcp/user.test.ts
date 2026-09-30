import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createMcpUserResolver, requireMcpUser } from '../../src/mcp/user.js';

const servers: http.Server[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

describe('createMcpUserResolver', () => {
  it('returns null without an email and never looks up', async () => {
    let calls = 0;
    const resolve = createMcpUserResolver(async () => { calls += 1; return 1; }, null);
    expect(await resolve()).toBeNull();
    expect(calls).toBe(0);
  });

  it('caches a found user but retries a missing one (user may be created later)', async () => {
    let result: number | null = null;
    let calls = 0;
    const resolve = createMcpUserResolver(async () => { calls += 1; return result; }, 'o@x.com');
    expect(await resolve()).toBeNull();
    result = 7;
    expect(await resolve()).toBe(7);
    expect(await resolve()).toBe(7);
    expect(calls).toBe(2);
  });
});

describe('requireMcpUser', () => {
  it('503s with a JSON-RPC config error when no MCP user resolves', async () => {
    const app = express();
    app.use(requireMcpUser(async () => null));
    app.post('/', (_req, res) => res.json({ reached: true }));
    const server = await new Promise<http.Server>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    servers.push(server);
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { method: 'POST' });
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/MCP_USER_EMAIL/);
  });
});
