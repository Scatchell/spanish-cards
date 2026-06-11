import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DayActivity, ProgressSummary } from '../api.js';
import { ApiError, fetchProgress } from '../api.js';
import { formatPercent } from '../format.js';

type LoadState = 'loading' | 'ready' | 'error';

export function ProgressPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [summary, setSummary] = useState<ProgressSummary | null>(null);

  const load = useCallback(() => {
    setLoadState('loading');
    fetchProgress()
      .then((data) => {
        setSummary(data);
        setLoadState('ready');
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          onLoggedOut();
        } else {
          setLoadState('error');
        }
      });
  }, [onLoggedOut]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="app-shell progress-page">
      <header className="app-header">
        <h1>Progress</h1>
        <div className="header-actions">
          <Link to="/train" className="train-link">
            Train
          </Link>
          <Link to="/" className="back-link">
            Back to cards
          </Link>
        </div>
      </header>

      <main>
        {loadState === 'loading' && <p className="hint">Loading progress…</p>}
        {loadState === 'error' && (
          <p className="form-error" role="alert">
            Something went wrong.{' '}
            <button type="button" className="secondary" onClick={load}>
              Retry
            </button>
          </p>
        )}
        {loadState === 'ready' && summary && <ProgressSummaryView summary={summary} />}
      </main>
    </div>
  );
}

function ProgressSummaryView({ summary }: { summary: ProgressSummary }) {
  return (
    <>
      <section aria-label="Deck overview">
        <h2>Deck</h2>
        <dl className="stats-grid">
          <Stat label="Total cards" value={summary.totalCards} />
          <Stat label="Due now" value={summary.dueNow} emphasized={summary.dueNow > 0} />
          <Stat label="New" value={summary.stages.new} />
          <Stat label="Learning" value={summary.stages.learning} />
          <Stat label="Review" value={summary.stages.review} />
        </dl>
      </section>

      <section aria-label="Study activity">
        <h2>Activity</h2>
        <dl className="stats-grid">
          <Stat label="Reviewed today" value={summary.reviewedToday} />
          <Stat label="Correct today" value={formatPercent(summary.correctRateToday)} />
          <Stat label="Avg daily correct" value={formatPercent(summary.averageDailyCorrectRate)} />
          <Stat
            label="Streak"
            value={`${summary.streakDays} day${summary.streakDays === 1 ? '' : 's'}`}
          />
          <Stat label="Last studied" value={formatLastStudied(summary.lastStudiedAt)} />
        </dl>
      </section>

      <section aria-label="Trends">
        <h2>Last {summary.recentDays.length} days</h2>
        {summary.lastStudiedAt === null ? (
          <p className="hint">
            No reviews yet — <Link to="/train">train some cards</Link> to start building history.
          </p>
        ) : (
          <>
            <TrendChart
              title="Reviews per day"
              days={summary.recentDays}
              value={(day) => day.reviews}
              describe={(day) => `${day.date}: ${day.reviews} reviews, ${day.correct} correct`}
            />
            <TrendChart
              title="Cards studied (cumulative)"
              days={summary.recentDays}
              value={(day) => day.cardsStudiedToDate}
              describe={(day) => `${day.date}: ${day.cardsStudiedToDate} cards studied`}
            />
          </>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string | number;
  emphasized?: boolean;
}) {
  return (
    <div className={emphasized ? 'stat-tile emphasized' : 'stat-tile'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// Dependency-free bar chart: one bar per day, height proportional to the
// day's value, details available via the title tooltip.
function TrendChart({
  title,
  days,
  value,
  describe,
}: {
  title: string;
  days: DayActivity[];
  value: (day: DayActivity) => number;
  describe: (day: DayActivity) => string;
}) {
  const max = Math.max(1, ...days.map(value));
  return (
    <figure className="trend-chart">
      <figcaption>{title}</figcaption>
      <div className="trend-bars" role="img" aria-label={title}>
        {days.map((day) => (
          <div
            key={day.date}
            className={value(day) > 0 ? 'trend-bar' : 'trend-bar empty'}
            style={{ height: `${Math.max(4, (value(day) / max) * 100)}%` }}
            title={describe(day)}
          />
        ))}
      </div>
      <div className="trend-range hint">
        <span>{shortDate(days[0]?.date)}</span>
        <span>{shortDate(days[days.length - 1]?.date)}</span>
      </div>
    </figure>
  );
}

function formatLastStudied(iso: string | null): string {
  if (iso === null) {
    return 'Never';
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shortDate(isoDate: string | undefined): string {
  if (!isoDate) {
    return '';
  }
  const [, month, day] = isoDate.split('-');
  return `${Number(day)}/${Number(month)}`;
}
