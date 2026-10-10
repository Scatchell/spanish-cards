import type { ReviewEvent } from './metrics.js';

// Days are bucketed in the user's local time via a fixed UTC offset supplied by
// the client; the offset is applied uniformly, so a DST change mid-history can
// shift which day a borderline review lands in — accepted for a personal
// dashboard.

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS = 30;
const MAX_DAYS = 365;
const WEEK_DAYS = 7;

export interface DayPoint {
  // Local calendar date, YYYY-MM-DD.
  date: string;
  reviews: number;
  correct: number;
  // correct / reviews, or null on a day with no reviews.
  accuracy: number | null;
  cardsAdded: number;
}

export interface WeekPoint {
  weekStart: string;
  weekEnd: string;
  reviews: number;
  correct: number;
  accuracy: number | null;
  cardsAdded: number;
}

export interface PeriodTotals {
  reviews: number;
  correct: number;
  accuracy: number | null;
  cardsAdded: number;
}

export interface ActivitySummary {
  reviewedToday: number;
  accuracyToday: number | null;
  currentStreak: number;
  bestStreak: number;
  daysStudiedLast7: number;
  daysStudiedLast30: number;
  lastStudiedAt: string | null;
}

export interface ActivityTrend {
  // Oldest first, today last; 30..365 entries.
  daily: DayPoint[];
  // Consecutive 7-day blocks counted back from today; oldest first. The oldest
  // block can hold fewer than 7 days.
  weekly: WeekPoint[];
  // The last 7 days and the 7 days before them.
  thisWeek: PeriodTotals;
  lastWeek: PeriodTotals;
}

export interface Activity {
  summary: ActivitySummary;
  trend: ActivityTrend;
}

const rate = (correct: number, reviews: number): number | null => (reviews === 0 ? null : correct / reviews);

// YYYY-MM-DD keys are UTC midnights of the local date, so differences between
// them are whole multiples of DAY_MS regardless of DST.
const dayStart = (key: string): number => Date.parse(`${key}T00:00:00Z`);

function totals(points: { reviews: number; correct: number; cardsAdded: number }[]): PeriodTotals {
  const reviews = points.reduce((sum, p) => sum + p.reviews, 0);
  const correct = points.reduce((sum, p) => sum + p.correct, 0);
  const cardsAdded = points.reduce((sum, p) => sum + p.cardsAdded, 0);
  return { reviews, correct, accuracy: rate(correct, reviews), cardsAdded };
}

export function computeActivity(
  input: { reviews: ReviewEvent[]; cardCreatedAts: Date[] },
  now: Date,
  tzOffsetMinutes: number,
): Activity {
  const dayKey = (instant: Date | number) =>
    new Date(Number(instant) + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);

  const reviewsByDay = new Map<string, { reviews: number; correct: number }>();
  let lastStudiedAt: Date | null = null;
  for (const review of input.reviews) {
    const day = dayKey(review.reviewedAt);
    const bucket = reviewsByDay.get(day) ?? { reviews: 0, correct: 0 };
    bucket.reviews += 1;
    bucket.correct += review.detectedCorrect ? 1 : 0;
    reviewsByDay.set(day, bucket);
    if (lastStudiedAt === null || review.reviewedAt > lastStudiedAt) {
      lastStudiedAt = review.reviewedAt;
    }
  }

  const addedByDay = new Map<string, number>();
  for (const createdAt of input.cardCreatedAts) {
    const day = dayKey(createdAt);
    addedByDay.set(day, (addedByDay.get(day) ?? 0) + 1);
  }

  const today = dayKey(now);
  // YYYY-MM-DD keys sort chronologically, so a plain sort finds the earliest.
  const firstDay = [...reviewsByDay.keys(), ...addedByDay.keys()].sort()[0] ?? today;
  const spanDays = Math.round((dayStart(today) - dayStart(firstDay)) / DAY_MS) + 1;
  const dayCount = Math.min(MAX_DAYS, Math.max(MIN_DAYS, spanDays));

  const daily: DayPoint[] = [];
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const date = dayKey(now.getTime() - i * DAY_MS);
    const bucket = reviewsByDay.get(date);
    const reviews = bucket?.reviews ?? 0;
    const correct = bucket?.correct ?? 0;
    daily.push({ date, reviews, correct, accuracy: rate(correct, reviews), cardsAdded: addedByDay.get(date) ?? 0 });
  }

  const weekly: WeekPoint[] = [];
  for (let end = daily.length; end > 0; end -= WEEK_DAYS) {
    const chunk = daily.slice(Math.max(0, end - WEEK_DAYS), end);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) continue;
    weekly.unshift({ weekStart: first.date, weekEnd: last.date, ...totals(chunk) });
  }

  const studiedDays = new Set(reviewsByDay.keys());
  const todayBucket = reviewsByDay.get(today);
  const countStudied = (points: DayPoint[]) => points.filter((p) => p.reviews > 0).length;

  return {
    summary: {
      reviewedToday: todayBucket?.reviews ?? 0,
      accuracyToday: todayBucket ? rate(todayBucket.correct, todayBucket.reviews) : null,
      currentStreak: currentStreak(studiedDays, now.getTime(), dayKey),
      bestStreak: bestStreak(studiedDays),
      daysStudiedLast7: countStudied(daily.slice(-7)),
      daysStudiedLast30: countStudied(daily.slice(-30)),
      lastStudiedAt: lastStudiedAt?.toISOString() ?? null,
    },
    trend: {
      daily,
      weekly,
      thisWeek: totals(daily.slice(-7)),
      lastWeek: totals(daily.slice(-14, -7)),
    },
  };
}

// A day without study only breaks the streak once it has fully passed: a
// streak ending yesterday still counts until today is over.
function currentStreak(
  studiedDays: Set<string>,
  nowMs: number,
  dayKey: (instant: Date | number) => string,
): number {
  let cursor = nowMs;
  if (!studiedDays.has(dayKey(cursor))) {
    cursor -= DAY_MS;
  }
  let streak = 0;
  while (studiedDays.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

function bestStreak(studiedDays: Set<string>): number {
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of [...studiedDays].sort()) {
    const time = dayStart(day);
    run = previous !== null && time - previous === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    previous = time;
  }
  return best;
}
