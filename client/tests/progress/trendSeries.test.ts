import { describe, expect, it } from 'vitest';
import { linePath, selectTrendSeries } from '../../src/progress/trendSeries.js';
import type { TrendPoint } from '../../src/progress/trendSeries.js';
import { makeReport } from './fixtures.js';

const point = (accuracy: number | null): TrendPoint => ({
  start: '2026-06-01',
  end: '2026-06-01',
  accuracy,
  reviews: accuracy === null ? 0 : 10,
  correct: accuracy === null ? 0 : Math.round(accuracy * 10),
});

describe('selectTrendSeries', () => {
  const { trend } = makeReport();

  it('takes the last 7 daily points for 7d', () => {
    const series = selectTrendSeries(trend, '7d');
    expect(series.granularity).toBe('day');
    expect(series.points).toHaveLength(7);
    expect(series.points[6]?.start).toBe(trend.daily[29]?.date);
  });

  it('takes the last 30 daily points for 30d', () => {
    expect(selectTrendSeries(trend, '30d').points).toHaveLength(30);
  });

  it('uses the weekly series for all time', () => {
    const series = selectTrendSeries(trend, 'year');
    expect(series.granularity).toBe('week');
    expect(series.points).toHaveLength(trend.weekly.length);
    expect(series.points[0]?.start).toBe(trend.weekly[0]?.weekStart);
    expect(series.points[0]?.end).toBe(trend.weekly[0]?.weekEnd);
  });

  it('returns fewer points when the history is shorter than the range', () => {
    const short = { ...trend, daily: trend.daily.slice(-3) };
    expect(selectTrendSeries(short, '30d').points).toHaveLength(3);
  });
});

describe('linePath', () => {
  it('returns an empty path when there is nothing to draw', () => {
    expect(linePath([])).toBe('');
    expect(linePath([point(null), point(null)])).toBe('');
  });

  it('centres each point in its column and maps accuracy to a flipped y', () => {
    // 2 columns: centres at x = 25 and 75; accuracy 1 -> y 0, accuracy 0.5 -> y 50.
    expect(linePath([point(1), point(0.5)])).toBe('M 25 0 L 75 50');
  });

  it('bridges days with no reviews instead of dropping to zero or breaking', () => {
    expect(linePath([point(1), point(null), point(0.5)])).toBe(
      `M ${(0.5 / 3) * 100} 0 L ${(2.5 / 3) * 100} 50`,
    );
  });

  it('draws only a move for a lone point (the dot shows it)', () => {
    expect(linePath([point(null), point(0.2), point(null)])).toBe(`M 50 80`);
  });
});
