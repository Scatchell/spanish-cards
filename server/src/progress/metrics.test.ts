import { describe, expect, it } from 'vitest';
import { clampTzOffset, computeReviewMetrics, countLearningStages } from './metrics.js';
import type { ReviewEvent } from './metrics.js';

// Fixed "now": 2026-06-10 15:00 UTC.
const NOW = new Date('2026-06-10T15:00:00Z');

let nextCardId = 1;

function review(reviewedAt: string, overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    cardId: overrides.cardId ?? nextCardId++,
    detectedCorrect: overrides.detectedCorrect ?? true,
    reviewedAt: new Date(reviewedAt),
  };
}

describe('computeReviewMetrics', () => {
  it('returns empty metrics when there is no history', () => {
    const metrics = computeReviewMetrics([], NOW, 0, 3);
    expect(metrics).toEqual({
      reviewedToday: 0,
      correctRateToday: null,
      averageDailyCorrectRate: null,
      streakDays: 0,
      lastStudiedAt: null,
      recentDays: [
        { date: '2026-06-08', reviews: 0, correct: 0, cardsStudiedToDate: 0 },
        { date: '2026-06-09', reviews: 0, correct: 0, cardsStudiedToDate: 0 },
        { date: '2026-06-10', reviews: 0, correct: 0, cardsStudiedToDate: 0 },
      ],
    });
  });

  it("counts today's reviews and correct rate", () => {
    const metrics = computeReviewMetrics(
      [
        review('2026-06-10T08:00:00Z', { detectedCorrect: true }),
        review('2026-06-10T09:00:00Z', { detectedCorrect: true }),
        review('2026-06-10T10:00:00Z', { detectedCorrect: false }),
        review('2026-06-09T10:00:00Z', { detectedCorrect: false }),
      ],
      NOW,
      0,
    );
    expect(metrics.reviewedToday).toBe(3);
    expect(metrics.correctRateToday).toBeCloseTo(2 / 3);
    expect(metrics.lastStudiedAt).toBe('2026-06-10T10:00:00.000Z');
  });

  it('buckets days in the local timezone, not UTC', () => {
    // 23:30 UTC on June 9th is already June 10th at UTC+2 (e.g. Madrid).
    const metrics = computeReviewMetrics([review('2026-06-09T23:30:00Z')], NOW, 120);
    expect(metrics.reviewedToday).toBe(1);

    // ...but still June 9th at UTC-5 (e.g. New York).
    const metricsWest = computeReviewMetrics([review('2026-06-09T23:30:00Z')], NOW, -300);
    expect(metricsWest.reviewedToday).toBe(0);
  });

  it('averages correct rates per day, not per review', () => {
    // Day 1: 1/1 correct. Day 2: 1/3 correct. Average of rates = 2/3, even
    // though only 2 of 4 reviews were correct overall.
    const metrics = computeReviewMetrics(
      [
        review('2026-06-08T10:00:00Z', { detectedCorrect: true }),
        review('2026-06-09T10:00:00Z', { detectedCorrect: true }),
        review('2026-06-09T11:00:00Z', { detectedCorrect: false }),
        review('2026-06-09T12:00:00Z', { detectedCorrect: false }),
      ],
      NOW,
      0,
    );
    expect(metrics.averageDailyCorrectRate).toBeCloseTo((1 + 1 / 3) / 2);
  });

  it('counts a streak of consecutive study days ending today', () => {
    const metrics = computeReviewMetrics(
      [
        review('2026-06-08T10:00:00Z'),
        review('2026-06-09T10:00:00Z'),
        review('2026-06-10T10:00:00Z'),
        // Gap on June 7th; June 6th must not count.
        review('2026-06-06T10:00:00Z'),
      ],
      NOW,
      0,
    );
    expect(metrics.streakDays).toBe(3);
  });

  it("keeps the streak alive when today hasn't been studied yet", () => {
    const metrics = computeReviewMetrics(
      [review('2026-06-08T10:00:00Z'), review('2026-06-09T10:00:00Z')],
      NOW,
      0,
    );
    expect(metrics.streakDays).toBe(2);
  });

  it('breaks the streak after a full missed day', () => {
    const metrics = computeReviewMetrics([review('2026-06-08T10:00:00Z')], NOW, 0);
    expect(metrics.streakDays).toBe(0);
  });

  it('accumulates distinct cards studied over time', () => {
    const metrics = computeReviewMetrics(
      [
        // Card 1 first studied June 8th, again June 10th (no double count).
        review('2026-06-08T10:00:00Z', { cardId: 1 }),
        review('2026-06-10T10:00:00Z', { cardId: 1 }),
        // Cards 2 and 3 first studied June 10th.
        review('2026-06-10T11:00:00Z', { cardId: 2 }),
        review('2026-06-10T12:00:00Z', { cardId: 3 }),
      ],
      NOW,
      0,
      3,
    );
    expect(metrics.recentDays).toEqual([
      { date: '2026-06-08', reviews: 1, correct: 1, cardsStudiedToDate: 1 },
      { date: '2026-06-09', reviews: 0, correct: 0, cardsStudiedToDate: 1 },
      { date: '2026-06-10', reviews: 3, correct: 3, cardsStudiedToDate: 3 },
    ]);
  });

  it('includes cards first studied before the recent window in the baseline', () => {
    const metrics = computeReviewMetrics(
      [review('2026-05-01T10:00:00Z', { cardId: 1 }), review('2026-06-10T10:00:00Z', { cardId: 2 })],
      NOW,
      0,
      2,
    );
    expect(metrics.recentDays.map((day) => day.cardsStudiedToDate)).toEqual([1, 2]);
  });
});

describe('clampTzOffset', () => {
  it('passes through sane offsets and defaults invalid input to UTC', () => {
    expect(clampTzOffset('120')).toBe(120);
    expect(clampTzOffset('-300')).toBe(-300);
    expect(clampTzOffset(undefined)).toBe(0);
    expect(clampTzOffset('not-a-number')).toBe(0);
    expect(clampTzOffset('1.5')).toBe(0);
  });

  it('clamps offsets beyond UTC±14', () => {
    expect(clampTzOffset('100000')).toBe(840);
    expect(clampTzOffset('-100000')).toBe(-840);
  });
});

describe('countLearningStages', () => {
  it('groups FSRS states into new/learning/review', () => {
    // FSRS states: 0=New, 1=Learning, 2=Review, 3=Relearning; null = no
    // schedule row yet.
    const stages = countLearningStages([
      { state: null, count: 4 },
      { state: 0, count: 1 },
      { state: 1, count: 2 },
      { state: 2, count: 5 },
      { state: 3, count: 3 },
    ]);
    expect(stages).toEqual({ new: 5, learning: 5, review: 5 });
  });

  it('returns zeros for an empty deck', () => {
    expect(countLearningStages([])).toEqual({ new: 0, learning: 0, review: 0 });
  });
});
