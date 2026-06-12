import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../../src/cards/repository.js';
import type { Explanation } from '../../src/explanations/repository.js';
import { explanationRoutes } from '../../src/explanations/routes.js';

const FAKE_CARD: Card = {
  id: 1,
  spanishText: 'me llamo',
  englishText: 'my name is',
  languagePair: 'en<->es',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  due: '2026-01-01T00:00:00.000Z',
  reviewed: false,
};

const FAKE_EXPLANATION: Explanation = {
  id: 1,
  spanishText: 'me llamo',
  englishText: 'my name is',
  contentMarkdown: '- **me llamo** = "I call myself"',
  model: 'gpt-5.4-mini',
  createdAt: '2026-01-01T00:00:00.000Z',
};

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

async function startServer(
  overrides: Parameters<typeof explanationRoutes>[2],
  generator: Parameters<typeof explanationRoutes>[1] = null,
): Promise<string> {
  const app = express();
  app.use(express.json());
  // pool is never called because all deps are overridden
  app.use('/api/cards', explanationRoutes({} as never, generator, overrides));
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/cards`;
}

async function post(base: string, path: string): Promise<Response> {
  return fetch(`${base}${path}`, { method: 'POST' });
}

describe('POST /:id/explanation', () => {
  it('returns 400 for a non-integer id', async () => {
    const base = await startServer({ getCard: vi.fn() });
    const res = await post(base, '/abc/explanation');
    expect(res.status).toBe(400);
  });

  it('returns 404 when card is not found', async () => {
    const base = await startServer({ getCard: async () => null });
    const res = await post(base, '/1/explanation');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Card not found');
  });

  it('returns 400 for unsupported language pair', async () => {
    const base = await startServer({
      getCard: async () => ({ ...FAKE_CARD, languagePair: 'fr<->es' }),
    });
    const res = await post(base, '/1/explanation');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Explanations are not supported for this card type');
  });

  it('returns 502 when generator is not configured', async () => {
    const base = await startServer({
      getCard: async () => FAKE_CARD,
      findExplanation: async () => null,
    });
    const res = await post(base, '/1/explanation');
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Explanation generation is not configured');
  });

  it('returns 502 when generator throws', async () => {
    const base = await startServer(
      {
        getCard: async () => FAKE_CARD,
        findExplanation: async () => null,
        insertExplanation: vi.fn(),
      },
      async () => {
        throw new Error('API down');
      },
    );
    const res = await post(base, '/1/explanation');
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Explanation generation failed');
  });

  it('returns 200 with explanation shape on success', async () => {
    const base = await startServer(
      {
        getCard: async () => FAKE_CARD,
        findExplanation: async () => null,
        insertExplanation: async () => FAKE_EXPLANATION,
      },
      async () => '- stubbed',
    );
    const res = await post(base, '/1/explanation');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      explanation: { contentMarkdown: string; model: string; createdAt: string };
      source: string;
    };
    expect(body.source).toBe('generated');
    expect(body.explanation.contentMarkdown).toBe(FAKE_EXPLANATION.contentMarkdown);
    expect(body.explanation.model).toBe(FAKE_EXPLANATION.model);
  });

  it('returns cached source when explanation already exists', async () => {
    const generate = vi.fn();
    const base = await startServer(
      {
        getCard: async () => FAKE_CARD,
        findExplanation: async () => FAKE_EXPLANATION,
      },
      generate,
    );
    const res = await post(base, '/1/explanation');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe('cached');
    expect(generate).not.toHaveBeenCalled();
  });
});
