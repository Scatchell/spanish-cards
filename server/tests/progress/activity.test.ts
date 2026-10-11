import { describe, expect, it } from 'vitest';
import { computeActivity } from '../../src/progress/activity.js';
import type { ReviewEvent } from '../../src/progress/activity.js';

// Fixed "now": 2026-06-10 15:00 UTC.
const NOW = new Date('2026-06-10T15:00:00Z');

function review(reviewedAt: string, detectedCorrect = true): ReviewEvent {
  return { detectedCorrect, reviewedAt: new Date(reviewedAt) };
}

function activity(reviews: ReviewEvent[], cardCreatedAts: string[] = [], tz = 0) {
  return computeActivity({ reviews, cardCreatedAts: cardCreatedAts.map((c) => new Date(c)) }, NOW, tz);
}

describe('computeActivity: empty history', () => {
  it('returns a 30-day zeroed series with null accuracy and no streak', () => {
    const { summary, trend } = activity([]);
    expect(summary).toEqual({
      reviewedToday: 0,
      accuracyToday: null,
      currentStreak: 0,
      bestStreak: 0,
      daysStudiedLast7: 0,
      daysStudiedLast30: 0,
      lastStudiedAt: null,
    });
    expect(trend.daily).toHaveLength(30);
    expect(trend.daily[0]).toEqual({ date: '2026-05-12', reviews: 0, correct: 0, accuracy: null, cardsAdded: 0 });
    expect(trend.daily[29]?.date).toBe('2026-06-10');
    expect(trend.last7Days).toEqual({ reviews: 0, correct: 0, accuracy: null, cardsAdded: 0 });
    expect(trend.previous7Days).toEqual({ reviews: 0, correct: 0, accuracy: null, cardsAdded: 0 });
  });

  it('builds weekly blocks back from today, with a partial oldest block', () => {
    const { trend } = activity([]);
    expect(trend.weekly).toHaveLength(5);
    expect(trend.weekly[4]).toMatchObject({ weekStart: '2026-06-04', weekEnd: '2026-06-10' });
    expect(trend.weekly[0]).toMatchObject({ weekStart: '2026-05-12', weekEnd: '2026-05-13' });
  });
});

describe('computeActivity: daily series', () => {
  it('computes per-day accuracy as correct / reviews, null on empty days', () => {
    const { trend } = activity([
      review('2026-06-10T08:00:00Z', true),
      review('2026-06-10T09:00:00Z', true),
      review('2026-06-10T10:00:00Z', false),
    ]);
    const today = trend.daily[29];
    expect(today).toMatchObject({ date: '2026-06-10', reviews: 3, correct: 2 });
    expect(today?.accuracy).toBeCloseTo(2 / 3);
    expect(trend.daily[28]?.accuracy).toBeNull();
  });

  it('extends the series back to the first review or card, beyond 30 days', () => {
    const { trend } = activity([review('2026-05-01T10:00:00Z')]);
    expect(trend.daily).toHaveLength(41);
    expect(trend.daily[0]?.date).toBe('2026-05-01');
  });

  it('starts the series at the first card created when that is older than any review', () => {
    const { trend } = activity([], ['2026-04-01T10:00:00Z']);
    expect(trend.daily[0]?.date).toBe('2026-04-01');
  });

  it('caps the series at 365 days', () => {
    const { trend } = activity([review('2024-01-01T10:00:00Z')]);
    expect(trend.daily).toHaveLength(365);
    expect(trend.daily[364]?.date).toBe('2026-06-10');
    expect(trend.weekly.length).toBe(53);
  });

  it('buckets days in the local timezone, not UTC', () => {
    // 23:30 UTC on June 9th is already June 10th at UTC+2.
    expect(activity([review('2026-06-09T23:30:00Z')], [], 120).summary.reviewedToday).toBe(1);
    // ...but still June 9th at UTC-5.
    expect(activity([review('2026-06-09T23:30:00Z')], [], -300).summary.reviewedToday).toBe(0);
  });

  it('counts cards added per local day', () => {
    const { trend } = activity([], ['2026-06-10T01:00:00Z', '2026-06-10T02:00:00Z', '2026-06-09T02:00:00Z']);
    expect(trend.daily[29]?.cardsAdded).toBe(2);
    expect(trend.daily[28]?.cardsAdded).toBe(1);
  });
});

describe('computeActivity: weekly series and comparison', () => {
  it('weights accuracy by review volume, not by day', () => {
    // 2 reviews (both correct) on 06-04 and 8 reviews (4 correct) on 06-10:
    // volume-weighted 6/10, whereas a mean of daily rates would be 75%.
    const reviews = [
      review('2026-06-04T10:00:00Z', true),
      review('2026-06-04T11:00:00Z', true),
      ...Array.from({ length: 8 }, (_, i) => review(`2026-06-10T0${i}:00:00Z`, i < 4)),
    ];
    const { trend } = activity(reviews);
    expect(trend.last7Days).toEqual({ reviews: 10, correct: 6, accuracy: 0.6, cardsAdded: 0 });
    expect(trend.weekly[4]).toMatchObject({ reviews: 10, correct: 6, accuracy: 0.6 });
  });

  it('puts reviews from 8-14 days ago in previous7Days', () => {
    const { trend } = activity([review('2026-05-30T10:00:00Z', true), review('2026-05-31T10:00:00Z', false)]);
    expect(trend.last7Days.reviews).toBe(0);
    expect(trend.previous7Days).toEqual({ reviews: 2, correct: 1, accuracy: 0.5, cardsAdded: 0 });
  });

  it('sums cards added into the weekly totals', () => {
    const { trend } = activity([], ['2026-06-08T10:00:00Z', '2026-06-09T10:00:00Z']);
    expect(trend.last7Days.cardsAdded).toBe(2);
  });
});

describe('computeActivity: streaks and days studied', () => {
  it('tracks the current streak and the best streak separately', () => {
    const days = ['06-10', '06-09', '06-08', '06-01', '06-02', '06-03', '06-04', '06-05'];
    const { summary } = activity(days.map((d) => review(`2026-${d}T10:00:00Z`)));
    expect(summary.currentStreak).toBe(3);
    expect(summary.bestStreak).toBe(5);
  });

  it('counts streak days in the local timezone', () => {
    // At UTC-5 these land on local 06-08, 06-09 and 06-10; in UTC they would span only 06-09 and 06-10.
    const { summary } = activity(
      [review('2026-06-09T00:30:00Z'), review('2026-06-10T01:30:00Z'), review('2026-06-10T05:30:00Z')],
      [],
      -300,
    );
    expect(summary.currentStreak).toBe(3);
  });

  it('keeps the streak alive when today is not studied yet', () => {
    const { summary } = activity([review('2026-06-09T10:00:00Z'), review('2026-06-08T10:00:00Z')]);
    expect(summary.currentStreak).toBe(2);
    expect(summary.reviewedToday).toBe(0);
  });

  it('breaks the streak after a fully missed day', () => {
    const { summary } = activity([review('2026-06-07T10:00:00Z')]);
    expect(summary.currentStreak).toBe(0);
    expect(summary.bestStreak).toBe(1);
  });

  it('counts distinct days studied in the last 7 and 30 days', () => {
    const { summary } = activity([
      review('2026-06-10T10:00:00Z'),
      review('2026-06-10T11:00:00Z'),
      review('2026-06-09T10:00:00Z'),
      review('2026-05-20T10:00:00Z'),
      review('2026-05-01T10:00:00Z'),
    ]);
    expect(summary.daysStudiedLast7).toBe(2);
    expect(summary.daysStudiedLast30).toBe(3);
  });

  it("reports today's accuracy and the last studied instant", () => {
    const { summary } = activity([review('2026-06-10T08:00:00Z', true), review('2026-06-10T10:00:00Z', false)]);
    expect(summary.accuracyToday).toBe(0.5);
    expect(summary.lastStudiedAt).toBe('2026-06-10T10:00:00.000Z');
  });
});
