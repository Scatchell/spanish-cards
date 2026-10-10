import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { MASTERED_STABILITY_DAYS, computeDeckBreakdown } from '../../src/progress/deck.js';

describe('computeDeckBreakdown', () => {
  it('returns zeros for an empty deck', () => {
    expect(computeDeckBreakdown([])).toEqual({
      total: 0, mastered: 0, familiar: 0, learning: 0, lapsed: 0, new: 0,
      masteredThresholdDays: MASTERED_STABILITY_DAYS,
    });
  });

  it('folds FSRS states into the five buckets', () => {
    const deck = computeDeckBreakdown([
      { state: null, durable: false, count: 2 },
      { state: State.New, durable: false, count: 1 },
      { state: State.Learning, durable: false, count: 4 },
      { state: State.Relearning, durable: false, count: 3 },
      { state: State.Review, durable: true, count: 5 },
      { state: State.Review, durable: false, count: 6 },
    ]);
    expect(deck).toMatchObject({ new: 3, learning: 4, lapsed: 3, mastered: 5, familiar: 6, total: 21 });
  });

  it('never treats stability as meaningful outside the Review state', () => {
    const deck = computeDeckBreakdown([{ state: State.Learning, durable: true, count: 2 }]);
    expect(deck).toMatchObject({ learning: 2, mastered: 0, familiar: 0 });
  });

  it('exposes the mastery threshold so the client can explain it', () => {
    expect(MASTERED_STABILITY_DAYS).toBe(21);
  });
});
