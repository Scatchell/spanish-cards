import { describe, expect, it } from 'vitest';
import { computeActivity } from '../../src/progress/activity.js';
import { computeDeckBreakdown } from '../../src/progress/deck.js';
import { assembleReport } from '../../src/progress/report.js';

const NOW = new Date('2026-06-10T15:00:00Z');

describe('assembleReport', () => {
  it('flattens the parts into one report object', () => {
    const activity = computeActivity({ reviews: [], cardCreatedAts: [] }, NOW, 120);
    const deck = computeDeckBreakdown([{ state: null, durable: false, count: 2 }]);
    const report = assembleReport({ activity, deck, dueNow: 2, recentMistakes: [] }, NOW, 120);

    expect(report.generatedAt).toBe('2026-06-10T15:00:00.000Z');
    expect(report.tzOffsetMinutes).toBe(120);
    expect(report.summary).toBe(activity.summary);
    expect(report.trend).toBe(activity.trend);
    expect(report.deck).toEqual({ ...deck, dueNow: 2 });
    expect(report.recentMistakes).toEqual([]);
  });
});
