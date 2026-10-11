import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedReviewEntry, ReviewItem } from '../../src/training/validation.js';

const { getEffectiveDue, getSchedule, insertReview, insertReviewHistory, upsertSchedule } = vi.hoisted(() => ({
  getEffectiveDue: vi.fn(),
  getSchedule: vi.fn(),
  insertReview: vi.fn(),
  insertReviewHistory: vi.fn(),
  upsertSchedule: vi.fn(),
}));

vi.mock('../../src/training/repository.js', () => ({
  getEffectiveDue,
  getSchedule,
  insertReview,
  insertReviewHistory,
  upsertSchedule,
}));

vi.mock('../../src/db.js', () => ({
  withTransaction: async (pool: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

const { MAX_BACKDATE_MS, clampReviewedAt, recordReviewBatch } = await import(
  '../../src/training/service.js'
);

const NOW = new Date('2026-03-10T12:00:00.000Z');

function item(cardId: number, id: string, reviewedAt: string): ParsedReviewEntry {
  const parsed: ReviewItem = {
    clientReviewId: id,
    reviewedAt: new Date(reviewedAt),
    request: {
      cardId,
      rating: 'good',
      direction: 'spanish-to-english',
      verdict: 'correct',
      submittedText: 'x',
      matchedText: 'x',
    },
  };
  return { clientReviewId: id, item: parsed };
}

beforeEach(() => {
  for (const mock of [getEffectiveDue, getSchedule, insertReview, insertReviewHistory, upsertSchedule]) {
    mock.mockReset();
  }
  getEffectiveDue.mockResolvedValue(new Date('2026-03-01T00:00:00.000Z'));
  getSchedule.mockResolvedValue(null);
  insertReview.mockResolvedValue(true);
  insertReviewHistory.mockResolvedValue(undefined);
  upsertSchedule.mockResolvedValue(undefined);
});

describe('clampReviewedAt', () => {
  it('keeps an in-window time', () => {
    const t = new Date('2026-03-09T00:00:00.000Z');
    expect(clampReviewedAt(t, NOW)).toEqual(t);
  });
  it('pulls a future time back to server now', () => {
    expect(clampReviewedAt(new Date('2030-01-01T00:00:00.000Z'), NOW)).toEqual(NOW);
  });
  it('pulls an ancient time forward to seven days ago', () => {
    expect(clampReviewedAt(new Date('2020-01-01T00:00:00.000Z'), NOW)).toEqual(
      new Date(NOW.getTime() - MAX_BACKDATE_MS),
    );
  });
});

describe('recordReviewBatch', () => {
  it('applies reviews in reviewedAt order but reports results in request order', async () => {
    const late = item(2, '00000000-0000-4000-8000-000000000002', '2026-03-10T11:00:00.000Z');
    const early = item(1, '00000000-0000-4000-8000-000000000001', '2026-03-10T10:00:00.000Z');

    const results = await recordReviewBatch({} as never, 1, [late, early], NOW);

    expect(getEffectiveDue.mock.calls.map((c) => c[2])).toEqual([1, 2]);
    expect(results).toEqual([
      { clientReviewId: late.clientReviewId, status: 'applied' },
      { clientReviewId: early.clientReviewId, status: 'applied' },
    ]);
  });

  it('uses the clamped client time as the review time', async () => {
    const future = item(1, '00000000-0000-4000-8000-000000000001', '2031-01-01T00:00:00.000Z');
    await recordReviewBatch({} as never, 1, [future], NOW);
    expect(insertReview.mock.calls[0]![1].reviewedAt).toEqual(NOW);
  });

  it('maps duplicate, cardNotFound and invalid without blocking the other items', async () => {
    const dup = item(1, '00000000-0000-4000-8000-000000000001', '2026-03-10T10:00:00.000Z');
    const missing = item(2, '00000000-0000-4000-8000-000000000002', '2026-03-10T10:01:00.000Z');
    const ok = item(3, '00000000-0000-4000-8000-000000000003', '2026-03-10T10:02:00.000Z');
    const bad: ParsedReviewEntry = { clientReviewId: 'garbage', item: null };

    getEffectiveDue.mockImplementation(async (_db, _user, cardId: number) =>
      cardId === 2 ? null : new Date('2026-03-01T00:00:00.000Z'),
    );
    insertReview.mockImplementation(async (_db, review: { cardId: number }) => review.cardId !== 1);

    const results = await recordReviewBatch({} as never, 1, [dup, missing, bad, ok], NOW);

    expect(results.map((r) => r.status)).toEqual(['duplicate', 'cardNotFound', 'invalid', 'applied']);
    expect(results[2]!.clientReviewId).toBe('garbage');
  });
});
