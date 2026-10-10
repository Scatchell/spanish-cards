import { useState } from 'react';
import type { ActivityTrend, PeriodTotals } from '../api.js';
import { formatPercent, formatShortDate } from '../format.js';
import { TREND_RANGES, linePath, selectTrendSeries } from './trendSeries.js';
import type { TrendPoint, TrendRange } from './trendSeries.js';

const reviewsLabel = (count: number) => `${count} ${count === 1 ? 'review' : 'reviews'}`;

function describePoint(point: TrendPoint, granularity: 'day' | 'week'): string {
  const label =
    granularity === 'day'
      ? formatShortDate(point.start)
      : `${formatShortDate(point.start)} – ${formatShortDate(point.end)}`;
  if (point.reviews === 0) {
    return `${label}: no reviews`;
  }
  return `${label}: ${formatPercent(point.accuracy)} correct, ${reviewsLabel(point.reviews)}`;
}

function describePeriod(points: TrendPoint[], range: TrendRange): string {
  const reviews = points.reduce((sum, p) => sum + p.reviews, 0);
  const correct = points.reduce((sum, p) => sum + p.correct, 0);
  const prefix = range === 'all' ? 'All time' : `Last ${TREND_RANGES.find((r) => r.value === range)?.label}`;
  if (reviews === 0) {
    return `${prefix}: no reviews`;
  }
  return `${prefix}: ${formatPercent(correct / reviews)} correct, ${reviewsLabel(reviews)}`;
}

export function AccuracyTrend({ trend }: { trend: ActivityTrend }) {
  const [range, setRange] = useState<TrendRange>('30d');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { granularity, points } = selectTrendSeries(trend, range);
  const maxReviews = Math.max(1, ...points.map((p) => p.reviews));
  const active = activeIndex === null ? null : (points[activeIndex] ?? null);
  const readout = active ? describePoint(active, granularity) : describePeriod(points, range);

  function chooseRange(next: TrendRange) {
    setRange(next);
    setActiveIndex(null);
  }

  return (
    <div className="accuracy-trend">
      <div className="trend-toolbar">
        <p className="trend-readout" role="status">
          {readout}
        </p>
        <div className="range-switcher" role="group" aria-label="Time range">
          {TREND_RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              className="range-button"
              aria-pressed={range === option.value}
              onClick={() => chooseRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-frame">
        <div className="chart-yaxis chart-yaxis-accuracy" aria-hidden="true">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div className="chart-body">
          <div className="chart-grid" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <svg className="chart-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={linePath(points)} fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="chart-cols" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
            {points.map((point, index) => (
              <div
                key={point.start}
                className={index === activeIndex ? 'chart-col is-active' : 'chart-col'}
                role="img"
                tabIndex={0}
                aria-label={describePoint(point, granularity)}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
              >
                <div className="chart-plot">
                  {point.accuracy !== null && (
                    <span className="chart-dot" style={{ bottom: `${point.accuracy * 100}%` }} />
                  )}
                </div>
                <div className="chart-volume">
                  {point.reviews > 0 && (
                    <span className="chart-bar" style={{ height: `${(point.reviews / maxReviews) * 100}%` }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-yaxis chart-yaxis-volume" aria-hidden="true">
          <span>{maxReviews}</span>
          <span>0</span>
        </div>
        <div className="chart-xaxis hint" aria-hidden="true">
          <span>{formatShortDate(points[0]?.start ?? '1970-01-01')}</span>
          <span>{formatShortDate(points[points.length - 1]?.end ?? '1970-01-01')}</span>
        </div>
      </div>
      <p className="chart-caption hint">Line: percent correct. Bars: reviews.</p>

      <WeekComparison thisWeek={trend.thisWeek} lastWeek={trend.lastWeek} />
    </div>
  );
}

function WeekComparison({ thisWeek, lastWeek }: { thisWeek: PeriodTotals; lastWeek: PeriodTotals }) {
  if (thisWeek.accuracy === null) {
    return <p className="week-comparison hint">No reviews in the last 7 days.</p>;
  }
  const hasPrevious = lastWeek.accuracy !== null;
  const delta = hasPrevious
    ? Math.round(thisWeek.accuracy * 100) - Math.round((lastWeek.accuracy as number) * 100)
    : null;
  return (
    <div className="week-comparison">
      <p>
        Last 7 days: {formatPercent(thisWeek.accuracy)} ({reviewsLabel(thisWeek.reviews)})
      </p>
      {hasPrevious && (
        <p>
          Previous 7 days: {formatPercent(lastWeek.accuracy)} ({reviewsLabel(lastWeek.reviews)})
        </p>
      )}
      {delta !== null && (
        <p className="week-delta">{delta === 0 ? 'Same as before' : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} points`}</p>
      )}
    </div>
  );
}
