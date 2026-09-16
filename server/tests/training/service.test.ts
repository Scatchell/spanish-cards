import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardSchedule } from '../../src/training/scheduler.js';
import type { ReviewRequest } from '../../src/training/validation.js';

const FIXED_SCHEDULE: CardSchedule = {
  due: new Date('2026-02-01T00:00:00.000Z'),
  stability: 1,
  difficulty: 1,
  elapsedDays: 0,
  scheduledDays: 1,
  learningSteps: 0,
  reps: 1,
  lapses: 0,
  state: 1,
  lastReview: null,
};

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

const { recordReview } = await import('../../src/training/service.js');

function makeRequest(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    cardId: 1,
    rating: 'good',
    direction: 'spanish-to-english',
    verdict: 'correct',
    submittedText: 'cat',
    matchedText: 'cat',
    ...overrides,
  };
}

describe('recordReview', () => {
  beforeEach(() => {
    getEffectiveDue.mockReset();
    getSchedule.mockReset();
    insertReview.mockReset();
    insertReviewHistory.mockReset();
    upsertSchedule.mockReset();
  });

  it('writes the alternate-aware matched text as correctText, not the primary', async () => {
    getEffectiveDue.mockResolvedValue(new Date('2026-01-01T00:00:00.000Z'));
    getSchedule.mockResolvedValue(null);
    insertReview.mockResolvedValue(undefined);
    insertReviewHistory.mockResolvedValue(undefined);
    upsertSchedule.mockResolvedValue(undefined);

    const pool = {} as never;
    const request = makeRequest({ matchedText: 'kitty', submittedText: 'kitty' });
    await recordReview(pool, request, new Date('2026-01-02T00:00:00.000Z'));

    expect(insertReviewHistory).toHaveBeenCalledOnce();
    const [, history] = insertReviewHistory.mock.calls[0]!;
    expect(history.correctText).toBe('kitty');
    expect(history.correctText).not.toBe('cat');
  });

  it('caps an over-long matchedText to the column width instead of throwing', async () => {
    getEffectiveDue.mockResolvedValue(new Date('2026-01-01T00:00:00.000Z'));
    getSchedule.mockResolvedValue(FIXED_SCHEDULE);
    insertReview.mockResolvedValue(undefined);
    insertReviewHistory.mockResolvedValue(undefined);
    upsertSchedule.mockResolvedValue(undefined);

    const pool = {} as never;
    const overLong = 'x'.repeat(200);
    const request = makeRequest({ matchedText: overLong });
    await recordReview(pool, request, new Date('2026-01-02T00:00:00.000Z'));

    const [, history] = insertReviewHistory.mock.calls[0]!;
    expect(history.correctText).toHaveLength(70);
  });

  it('returns null without writing history when the card does not exist', async () => {
    getEffectiveDue.mockResolvedValue(null);

    const pool = {} as never;
    const outcome = await recordReview(pool, makeRequest(), new Date('2026-01-02T00:00:00.000Z'));

    expect(outcome).toBeNull();
    expect(insertReviewHistory).not.toHaveBeenCalled();
  });
});
