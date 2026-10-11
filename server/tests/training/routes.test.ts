import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asUser } from '../helpers/as-user.js';

const { recordReviewBatch } = vi.hoisted(() => ({ recordReviewBatch: vi.fn() }));
vi.mock('../../src/training/service.js', () => ({ recordReviewBatch }));
vi.mock('../../src/training/repository.js', () => ({ getTrainingQueue: vi.fn() }));

const { trainingRoutes } = await import('../../src/training/routes.js');

const servers: http.Server[] = [];
afterEach(async () => {
  recordReviewBatch.mockReset();
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

async function post(body: unknown): Promise<Response> {
  const app = express();
  app.use(express.json());
  app.use(asUser(7));
  app.use('/api/training', trainingRoutes({} as never));
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}/api/training/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ITEM = {
  cardId: 1,
  rating: 'good',
  direction: 'spanish-to-english',
  verdict: 'correct',
  submittedText: 'cat',
  matchedText: 'cat',
  clientReviewId: '3f8f6f0e-5b7a-4a52-9d4e-0f2f6a1c9b11',
  reviewedAt: '2026-03-10T10:00:00.000Z',
};

describe('POST /api/training/reviews', () => {
  it('400s for the old single-review body and for empty or oversized lists', async () => {
    expect((await post(ITEM)).status).toBe(400);
    expect((await post({ reviews: [] })).status).toBe(400);
    expect((await post({ reviews: Array.from({ length: 101 }, () => ITEM) })).status).toBe(400);
    expect(recordReviewBatch).not.toHaveBeenCalled();
  });

  it('passes the user and parsed entries to the service and returns its results', async () => {
    recordReviewBatch.mockResolvedValue([{ clientReviewId: ITEM.clientReviewId, status: 'applied' }]);

    const response = await post({ reviews: [ITEM] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ clientReviewId: ITEM.clientReviewId, status: 'applied' }],
    });
    const [, userId, entries] = recordReviewBatch.mock.calls[0]!;
    expect(userId).toBe(7);
    expect(entries[0].item.clientReviewId).toBe(ITEM.clientReviewId);
  });

  it('still returns 200 when an item is malformed, leaving it to the service to report invalid', async () => {
    recordReviewBatch.mockResolvedValue([{ clientReviewId: null, status: 'invalid' }]);
    const response = await post({ reviews: [{ nonsense: true }] });
    expect(response.status).toBe(200);
  });
});
