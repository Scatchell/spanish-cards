import { describe, expect, it } from 'vitest';
import type { CardSchedule, ReviewRating } from '../../src/training/scheduler.js';
import { isReviewRating, rateSchedule } from '../../src/training/scheduler.js';

const NOW = new Date('2026-06-11T12:00:00Z');

describe('rateSchedule', () => {
  it('schedules a never-reviewed card into the future on first rating', () => {
    const schedule = rateSchedule(null, 'good', NOW);
    expect(schedule.due.getTime()).toBeGreaterThan(NOW.getTime());
    expect(schedule.reps).toBe(1);
    expect(schedule.lastReview?.getTime()).toBe(NOW.getTime());
  });

  it('orders intervals by rating: again < hard < good < easy', () => {
    const dues = (['again', 'hard', 'good', 'easy'] as ReviewRating[]).map(
      (rating) => rateSchedule(null, rating, NOW).due.getTime(),
    );
    expect(dues[0]).toBeLessThan(dues[1]!);
    expect(dues[1]).toBeLessThan(dues[2]!);
    expect(dues[2]).toBeLessThan(dues[3]!);
  });

  it('pushes the due date further out on each successful review', () => {
    const first = rateSchedule(null, 'good', NOW);
    const secondReviewAt = new Date(first.due.getTime() + 60_000);
    const second = rateSchedule(first, 'good', secondReviewAt);

    expect(second.reps).toBe(2);
    const firstInterval = first.due.getTime() - NOW.getTime();
    const secondInterval = second.due.getTime() - secondReviewAt.getTime();
    expect(secondInterval).toBeGreaterThan(firstInterval);
  });

  it('counts a lapse when a learned card is forgotten', () => {
    // Easy on a new card promotes it straight to the Review state.
    const learned = rateSchedule(null, 'easy', NOW);
    const forgottenAt = new Date(learned.due.getTime() + 60_000);
    const forgotten = rateSchedule(learned, 'again', forgottenAt);

    expect(forgotten.lapses).toBe(learned.lapses + 1);
    // Forgetting brings the card back soon rather than keeping the long interval.
    expect(forgotten.due.getTime() - forgottenAt.getTime()).toBeLessThan(
      learned.due.getTime() - NOW.getTime(),
    );
  });

  it('survives a persistence round trip (plain values in, valid schedule out)', () => {
    const first = rateSchedule(null, 'good', NOW);
    // Simulate what comes back from the database: dates reconstructed from ISO strings.
    const fromDb: CardSchedule = {
      ...first,
      due: new Date(first.due.toISOString()),
      lastReview: first.lastReview ? new Date(first.lastReview.toISOString()) : null,
    };
    const laterAt = new Date(first.due.getTime() + 60_000);
    const second = rateSchedule(fromDb, 'good', laterAt);
    expect(second.due.getTime()).toBeGreaterThan(laterAt.getTime());
    expect(second.reps).toBe(2);
  });
});

describe('isReviewRating', () => {
  it('accepts the four ratings and rejects everything else', () => {
    expect(isReviewRating('again')).toBe(true);
    expect(isReviewRating('easy')).toBe(true);
    expect(isReviewRating('manual')).toBe(false);
    expect(isReviewRating(2)).toBe(false);
    expect(isReviewRating(undefined)).toBe(false);
  });
});
