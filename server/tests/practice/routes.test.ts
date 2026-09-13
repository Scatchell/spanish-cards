import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { practiceRoutes } from '../../src/practice/routes.js';
import type { GenerateResult } from '../../src/practice/service.js';
import type { PracticeSession } from '../../src/practice/repository.js';

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

const SESSION: PracticeSession = {
  id: 1,
  reviewCategorizationId: 5,
  model: 'gpt-5.4',
  generatedAt: '2026-09-13T00:00:00.000Z',
  examples: [],
  sentences: [{ spanish: 'la mesa blanca', english: 'the white table' }],
};

async function startServer(overrides: {
  getPracticeSession?: (id: number) => Promise<PracticeSession | null>;
  handleGenerate?: (id: number) => Promise<GenerateResult>;
}): Promise<string> {
  const app = express();
  app.use(
    '/api/practice',
    practiceRoutes({} as never, null, {
      getPracticeSession: overrides.getPracticeSession ?? (async () => null),
      handleGenerate: overrides.handleGenerate ?? (async () => ({ status: 'ok', session: SESSION })),
    }),
  );
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/practice`;
}

describe('GET /api/practice/:categorizationId', () => {
  it('400s for a non-numeric id', async () => {
    const base = await startServer({});
    const res = await fetch(`${base}/not-a-number`);
    expect(res.status).toBe(400);
  });

  it('404s when no session exists yet', async () => {
    const base = await startServer({ getPracticeSession: async () => null });
    const res = await fetch(`${base}/5`);
    expect(res.status).toBe(404);
  });

  it('returns the session when one exists', async () => {
    const base = await startServer({ getPracticeSession: async () => SESSION });
    const res = await fetch(`${base}/5`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ session: SESSION });
  });
});

describe('POST /api/practice/:categorizationId', () => {
  it('400s for a non-numeric id', async () => {
    const base = await startServer({});
    const res = await fetch(`${base}/nope`, { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('503s when generation is unavailable', async () => {
    const base = await startServer({ handleGenerate: async () => ({ status: 'unavailable' }) });
    const res = await fetch(`${base}/5`, { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('404s when the mistake is not found', async () => {
    const base = await startServer({ handleGenerate: async () => ({ status: 'not_found' }) });
    const res = await fetch(`${base}/5`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('returns the generated session on success', async () => {
    const handleGenerate = vi.fn(async () => ({ status: 'ok' as const, session: SESSION }));
    const base = await startServer({ handleGenerate });
    const res = await fetch(`${base}/5`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ session: SESSION });
    expect(handleGenerate).toHaveBeenCalledWith(5);
  });
});
