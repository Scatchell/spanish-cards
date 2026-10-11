import type { ActivityTrend } from '../api.js';

export type TrendRange = '7d' | '30d' | 'year';

// `summary` leads the readout while no column is hovered. The server keeps at
// most a year of daily history, so the longest range is a year, not "all time".
export const TREND_RANGES: { value: TrendRange; label: string; summary: string }[] = [
  { value: '7d', label: '7 days', summary: 'Last 7 days' },
  { value: '30d', label: '30 days', summary: 'Last 30 days' },
  { value: 'year', label: 'Year', summary: 'Last year' },
];

export interface TrendPoint {
  start: string;
  end: string;
  accuracy: number | null;
  reviews: number;
  correct: number;
}

export interface TrendSeries {
  granularity: 'day' | 'week';
  points: TrendPoint[];
}

const RANGE_DAYS = { '7d': 7, '30d': 30 } as const;

export function selectTrendSeries(trend: ActivityTrend, range: TrendRange): TrendSeries {
  if (range === 'year') {
    return {
      granularity: 'week',
      points: trend.weekly.map((week) => ({
        start: week.weekStart,
        end: week.weekEnd,
        accuracy: week.accuracy,
        reviews: week.reviews,
        correct: week.correct,
      })),
    };
  }
  return {
    granularity: 'day',
    points: trend.daily.slice(-RANGE_DAYS[range]).map((day) => ({
      start: day.date,
      end: day.date,
      accuracy: day.accuracy,
      reviews: day.reviews,
      correct: day.correct,
    })),
  };
}

// SVG path in a 0..100 square (drawn with preserveAspectRatio="none"): each
// point sits at the centre of its column, accuracy 1 is the top. Days with no
// reviews are skipped, so the line bridges the gap between the days that have
// data; the dots still show which days those are.
export function linePath(points: TrendPoint[]): string {
  const commands: string[] = [];
  points.forEach((point, index) => {
    if (point.accuracy === null) return;
    const x = ((index + 0.5) / points.length) * 100;
    const y = 100 - point.accuracy * 100;
    commands.push(`${commands.length === 0 ? 'M' : 'L'} ${x} ${y}`);
  });
  return commands.join(' ');
}
