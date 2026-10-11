import type { CategoryMistake, DayPoint, PeriodTotals, ProgressReport, WeekPoint } from '../../src/api.js';

// 30 days ending 2026-06-10. Day 0 has no reviews; the rest have 10+i reviews
// at roughly 70% accuracy, so charts always have a gap, a lone start, and data.
function dateKey(dayIndex: number): string {
  return new Date(Date.UTC(2026, 4, 12 + dayIndex)).toISOString().slice(0, 10);
}

const daily: DayPoint[] = Array.from({ length: 30 }, (_, i) => {
  const reviews = i === 0 ? 0 : 10 + i;
  const correct = Math.round(reviews * 0.7);
  return {
    date: dateKey(i),
    reviews,
    correct,
    accuracy: reviews === 0 ? null : correct / reviews,
    cardsAdded: i % 7 === 0 ? 3 : 0,
  };
});

function totals(points: PeriodTotals[]): PeriodTotals {
  const reviews = points.reduce((sum, p) => sum + p.reviews, 0);
  const correct = points.reduce((sum, p) => sum + p.correct, 0);
  const cardsAdded = points.reduce((sum, p) => sum + p.cardsAdded, 0);
  return { reviews, correct, accuracy: reviews === 0 ? null : correct / reviews, cardsAdded };
}

// Blocks of 7 days counted back from today; the oldest holds the 2 left over.
const weekly: WeekPoint[] = [daily.slice(0, 2), ...[2, 9, 16, 23].map((start) => daily.slice(start, start + 7))].map(
  (block) => ({ weekStart: block[0]!.date, weekEnd: block[block.length - 1]!.date, ...totals(block) }),
);

export function makeMistake(overrides: Partial<CategoryMistake> = {}): CategoryMistake {
  return {
    id: 7,
    category: 'agreement',
    rationale: 'blanco should agree with casa',
    practiceTargets: [{ expected: 'blanca', submitted: 'blanco' }],
    correctText: 'la casa blanca',
    submittedText: 'la casa blanco',
    direction: 'english-to-spanish',
    verdict: 'incorrect',
    createdAt: '2026-06-09T14:03:11.000Z',
    ...overrides,
  };
}

export function makeReport(overrides: Partial<ProgressReport> = {}): ProgressReport {
  return {
    generatedAt: '2026-06-10T15:00:00.000Z',
    tzOffsetMinutes: 0,
    summary: {
      reviewedToday: 39,
      accuracyToday: 0.72,
      currentStreak: 6,
      bestStreak: 11,
      daysStudiedLast7: 5,
      daysStudiedLast30: 19,
      lastStudiedAt: '2026-06-10T10:00:00.000Z',
    },
    trend: {
      daily,
      weekly,
      last7Days: totals(daily.slice(-7)),
      previous7Days: totals(daily.slice(-14, -7)),
    },
    deck: {
      total: 40,
      mastered: 6,
      familiar: 10,
      learning: 12,
      lapsed: 4,
      new: 8,
      masteredThresholdDays: 21,
      dueNow: 9,
    },
    recentMistakes: [makeMistake()],
    ...overrides,
  };
}
