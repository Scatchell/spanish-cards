import type { CategoryMistake, ProgressReport } from '../../src/api.js';

// 30 days ending 2026-06-10. Day 0 has no reviews; the rest have 10+i reviews
// at roughly 70% accuracy, so charts always have a gap, a lone start, and data.
function dateKey(dayIndex: number): string {
  return new Date(Date.UTC(2026, 4, 12 + dayIndex)).toISOString().slice(0, 10);
}

const daily = Array.from({ length: 30 }, (_, i) => {
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
      weekly: [
        { weekStart: '2026-05-12', weekEnd: '2026-05-13', reviews: 11, correct: 8, accuracy: 8 / 11, cardsAdded: 3 },
        { weekStart: '2026-05-14', weekEnd: '2026-05-20', reviews: 90, correct: 63, accuracy: 0.7, cardsAdded: 3 },
        { weekStart: '2026-05-21', weekEnd: '2026-05-27', reviews: 120, correct: 84, accuracy: 0.7, cardsAdded: 0 },
        { weekStart: '2026-05-28', weekEnd: '2026-06-03', reviews: 150, correct: 105, accuracy: 0.7, cardsAdded: 3 },
        { weekStart: '2026-06-04', weekEnd: '2026-06-10', reviews: 200, correct: 150, accuracy: 0.75, cardsAdded: 0 },
      ],
      thisWeek: { reviews: 200, correct: 150, accuracy: 0.75, cardsAdded: 0 },
      lastWeek: { reviews: 150, correct: 105, accuracy: 0.7, cardsAdded: 3 },
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
