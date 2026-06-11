import { learningStage } from '../training/scheduler.js';
import type { LearningStage } from '../training/scheduler.js';

// Pure progress-metric calculations over review history. Days are bucketed in
// the user's local time via a fixed UTC offset supplied by the client; the
// offset is applied uniformly, so a DST change mid-history can shift which
// day a borderline review lands in — accepted for a personal dashboard.

export interface ReviewEvent {
  cardId: number;
  detectedCorrect: boolean;
  reviewedAt: Date;
}

export interface DayActivity {
  // Local calendar date, YYYY-MM-DD.
  date: string;
  reviews: number;
  correct: number;
  // Distinct cards reviewed at least once up to and including this day.
  cardsStudiedToDate: number;
}

export interface ReviewMetrics {
  reviewedToday: number;
  // Correct rates are 0..1 fractions; null when there is nothing to rate.
  correctRateToday: number | null;
  // Mean of per-day correct rates across all days that have reviews.
  averageDailyCorrectRate: number | null;
  streakDays: number;
  lastStudiedAt: string | null;
  // The last `recentDayCount` local days, oldest first, today last.
  recentDays: DayActivity[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TZ_OFFSET_MINUTES = 14 * 60;

// Minutes ahead of UTC for the user's local time (the negation of
// JavaScript's Date#getTimezoneOffset). Invalid input falls back to UTC.
export function clampTzOffset(value: unknown): number {
  const offset = Number(value);
  if (!Number.isInteger(offset)) {
    return 0;
  }
  return Math.max(-MAX_TZ_OFFSET_MINUTES, Math.min(MAX_TZ_OFFSET_MINUTES, offset));
}

export function computeReviewMetrics(
  reviews: ReviewEvent[],
  now: Date,
  tzOffsetMinutes: number,
  recentDayCount = 14,
): ReviewMetrics {
  const dayKey = (instant: Date | number) =>
    new Date(Number(instant) + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);

  const byDay = new Map<string, { reviews: number; correct: number }>();
  const firstReviewDayByCard = new Map<number, string>();
  let lastStudiedAt: Date | null = null;
  for (const review of reviews) {
    const day = dayKey(review.reviewedAt);
    const bucket = byDay.get(day) ?? { reviews: 0, correct: 0 };
    bucket.reviews += 1;
    bucket.correct += review.detectedCorrect ? 1 : 0;
    byDay.set(day, bucket);

    const firstDay = firstReviewDayByCard.get(review.cardId);
    if (firstDay === undefined || day < firstDay) {
      firstReviewDayByCard.set(review.cardId, day);
    }
    if (lastStudiedAt === null || review.reviewedAt > lastStudiedAt) {
      lastStudiedAt = review.reviewedAt;
    }
  }

  const today = byDay.get(dayKey(now));
  const dailyRates = [...byDay.values()].map((bucket) => bucket.correct / bucket.reviews);
  // YYYY-MM-DD keys sort chronologically, so string comparison works below.
  const firstReviewDays = [...firstReviewDayByCard.values()];

  const recentDays: DayActivity[] = [];
  for (let i = recentDayCount - 1; i >= 0; i -= 1) {
    const date = dayKey(now.getTime() - i * DAY_MS);
    const bucket = byDay.get(date);
    recentDays.push({
      date,
      reviews: bucket?.reviews ?? 0,
      correct: bucket?.correct ?? 0,
      cardsStudiedToDate: firstReviewDays.filter((day) => day <= date).length,
    });
  }

  return {
    reviewedToday: today?.reviews ?? 0,
    correctRateToday: today ? today.correct / today.reviews : null,
    averageDailyCorrectRate:
      dailyRates.length === 0
        ? null
        : dailyRates.reduce((sum, rate) => sum + rate, 0) / dailyRates.length,
    streakDays: streakDays(byDay, now, dayKey),
    lastStudiedAt: lastStudiedAt?.toISOString() ?? null,
    recentDays,
  };
}

// Consecutive days with at least one review, counting back from today. A day
// without study only breaks the streak once it has fully passed: a streak
// ending yesterday still counts until today is over.
function streakDays(
  byDay: Map<string, unknown>,
  now: Date,
  dayKey: (instant: Date | number) => string,
): number {
  let cursor = now.getTime();
  if (!byDay.has(dayKey(cursor))) {
    cursor -= DAY_MS;
  }
  let streak = 0;
  while (byDay.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export type StageCounts = Record<LearningStage, number>;

// Folds raw `card_schedules.state` counts (state null = card never reviewed)
// into the coarse new/learning/review stages.
export function countLearningStages(rows: { state: number | null; count: number }[]): StageCounts {
  const stages: StageCounts = { new: 0, learning: 0, review: 0 };
  for (const row of rows) {
    stages[learningStage(row.state)] += row.count;
  }
  return stages;
}
