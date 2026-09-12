import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { categorizationRoutes } from '../../src/categorization/routes.js';
import type { CategoryCount, MistakesPage } from '../../src/categorization/dashboard-repository.js';

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

async function startServer(overrides: {
  getCategorySummary?: () => Promise<CategoryCount[]>;
  getCategoryMistakes?: (...args: unknown[]) => Promise<MistakesPage>;
}): Promise<string> {
  const app = express();
  app.use(
    '/api/categorization',
    categorizationRoutes({} as never, {
      getCategorySummary: overrides.getCategorySummary ?? (async () => []),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCategoryMistakes: (overrides.getCategoryMistakes as any) ?? (async () => ({ items: [], nextCursor: null })),
    }),
  );
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/categorization`;
}

describe('GET /api/categorization/summary', () => {
  it('returns the summary from the repository', async () => {
    const base = await startServer({
      getCategorySummary: async () => [{ category: 'vocabulary', count: 3 }],
    });
    const res = await fetch(`${base}/summary`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ categories: [{ category: 'vocabulary', count: 3 }] });
  });
});

describe('GET /api/categorization/mistakes', () => {
  it('400s when category is missing', async () => {
    const base = await startServer({});
    const res = await fetch(`${base}/mistakes`);
    expect(res.status).toBe(400);
  });

  it('400s when category is not a known slug', async () => {
    const base = await startServer({});
    const res = await fetch(`${base}/mistakes?category=not_real`);
    expect(res.status).toBe(400);
  });

  it('400s when cursor is malformed', async () => {
    const base = await startServer({});
    const res = await fetch(`${base}/mistakes?category=vocabulary&cursor=garbage`);
    expect(res.status).toBe(400);
  });

  it('returns a page for a valid category', async () => {
    const base = await startServer({
      getCategoryMistakes: async () => ({ items: [], nextCursor: null }),
    });
    const res = await fetch(`${base}/mistakes?category=vocabulary`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('clamps limit to the 1-100 range, defaulting to 50', async () => {
    const getCategoryMistakes = vi.fn(async () => ({ items: [], nextCursor: null }));
    const base = await startServer({ getCategoryMistakes });
    await fetch(`${base}/mistakes?category=vocabulary&limit=500`);
    expect(getCategoryMistakes).toHaveBeenCalledWith(expect.anything(), 'vocabulary', {
      cursor: null,
      limit: 100,
    });
  });
});
