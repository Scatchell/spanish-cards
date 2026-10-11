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
    insertReview.mockResolvedValue(true);
    insertReviewHistory.mockResolvedValue(undefined);
    upsertSchedule.mockResolvedValue(undefined);

    const pool = {} as never;
    const request = makeRequest({ matchedText: 'kitty', submittedText: 'kitty' });
    await recordReview(pool, 1, request, new Date('2026-01-02T00:00:00.000Z'));

    expect(insertReviewHistory).toHaveBeenCalledOnce();
    const [, history] = insertReviewHistory.mock.calls[0]!;
    expect(history.correctText).toBe('kitty');
    expect(history.correctText).not.toBe('cat');
  });

  it('caps an over-long matchedText to the column width instead of throwing', async () => {
    getEffectiveDue.mockResolvedValue(new Date('2026-01-01T00:00:00.000Z'));
    getSchedule.mockResolvedValue(FIXED_SCHEDULE);
    insertReview.mockResolvedValue(true);
    insertReviewHistory.mockResolvedValue(undefined);
    upsertSchedule.mockResolvedValue(undefined);

    const pool = {} as never;
    const overLong = 'x'.repeat(200);
    const request = makeRequest({ matchedText: overLong });
    await recordReview(pool, 1, request, new Date('2026-01-02T00:00:00.000Z'));

    const [, history] = insertReviewHistory.mock.calls[0]!;
    expect(history.correctText).toHaveLength(70);
  });

  it('returns null without writing history when the card does not exist', async () => {
    getEffectiveDue.mockResolvedValue(null);

    const pool = {} as never;
    const outcome = await recordReview(pool, 1, makeRequest(), new Date('2026-01-02T00:00:00.000Z'));

    expect(outcome).toBeNull();
    expect(insertReviewHistory).not.toHaveBeenCalled();
  });

  const CLIENT_ID = '3f8f6f0e-5b7a-4a52-9d4e-0f2f6a1c9b11';

  it('reports a duplicate and skips the schedule update and history when the id was already recorded', async () => {
    getEffectiveDue.mockResolvedValue(new Date('2026-01-01T00:00:00.000Z'));
    getSchedule.mockResolvedValue(FIXED_SCHEDULE);
    insertReview.mockResolvedValue(false);

    const outcome = await recordReview(
      {} as never,
      1,
      makeRequest(),
      new Date('2026-01-02T00:00:00.000Z'),
      CLIENT_ID,
    );

    expect(outcome).toMatchObject({ duplicate: true });
    expect(upsertSchedule).not.toHaveBeenCalled();
    expect(insertReviewHistory).not.toHaveBeenCalled();
    expect(insertReview.mock.calls[0]![1]).toMatchObject({ clientReviewId: CLIENT_ID });
  });

  it('marks a freshly applied review as not duplicate and forwards the id', async () => {
    getEffectiveDue.mockResolvedValue(new Date('2026-01-01T00:00:00.000Z'));
    getSchedule.mockResolvedValue(FIXED_SCHEDULE);
    insertReview.mockResolvedValue(true);
    insertReviewHistory.mockResolvedValue(undefined);
    upsertSchedule.mockResolvedValue(undefined);

    const outcome = await recordReview(
      {} as never,
      1,
      makeRequest(),
      new Date('2026-01-02T00:00:00.000Z'),
      CLIENT_ID,
    );

    expect(outcome).toMatchObject({ duplicate: false });
    expect(upsertSchedule).toHaveBeenCalledOnce();
    expect(insertReview.mock.calls[0]![1]).toMatchObject({ clientReviewId: CLIENT_ID });
  });

  it('computes wasDue and history time from the supplied review time, not the wall clock', async () => {
    getEffectiveDue.mockResolvedValue(new Date('2026-01-05T00:00:00.000Z'));
    getSchedule.mockResolvedValue(FIXED_SCHEDULE);
    insertReview.mockResolvedValue(true);
    insertReviewHistory.mockResolvedValue(undefined);
    upsertSchedule.mockResolvedValue(undefined);

    const early = await recordReview({} as never, 1, makeRequest(), new Date('2026-01-02T00:00:00.000Z'));
    const late = await recordReview({} as never, 1, makeRequest(), new Date('2026-01-06T00:00:00.000Z'));

    expect(early!.wasDue).toBe(false);
    expect(late!.wasDue).toBe(true);
    expect(insertReviewHistory.mock.calls[1]![1].attemptedAt).toEqual(new Date('2026-01-06T00:00:00.000Z'));
  });
});
