import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { progressRoutes } from '../../src/progress/routes.js';
import type { ProgressReport } from '../../src/progress/report.js';
import { asUser } from '../helpers/as-user.js';

const servers: http.Server[] = [];

afterEach(() =>
  Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve())))).then(
    () => undefined,
  ),
);

async function startServer(buildReport: (...args: unknown[]) => Promise<ProgressReport>): Promise<string> {
  const app = express();
  app.use(asUser(7));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use('/api/progress', progressRoutes({} as never, { buildReport: buildReport as any }));
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/progress`;
}

const fakeReport = { generatedAt: 'x' } as unknown as ProgressReport;

describe('GET /api/progress', () => {
  it('returns the built report for the signed-in user, passing the clamped offset', async () => {
    const buildReport = vi.fn(async (..._args: unknown[]) => fakeReport);
    const base = await startServer(buildReport);
    const res = await fetch(`${base}?tzOffset=120`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ generatedAt: 'x' });
    expect(buildReport).toHaveBeenCalledWith({}, 7, expect.any(Date), 120);
  });
});
