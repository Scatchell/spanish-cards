import type { ActivitySummary } from '../api.js';
import { formatLastStudied, formatPercent } from '../format.js';
import { Stat } from './Stat.js';

const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;

function streakNote(summary: ActivitySummary): string {
  const { currentStreak, bestStreak, reviewedToday } = summary;
  if (currentStreak === 0) {
    return bestStreak === 0
      ? 'Study today to start a streak'
      : `Study today to start a new streak. Your best is ${days(bestStreak)}.`;
  }
  if (reviewedToday === 0) {
    return 'Study today to keep it going';
  }
  return currentStreak === bestStreak ? 'Your longest streak yet' : `Best: ${days(bestStreak)}`;
}

export function ActivityStrip({ summary }: { summary: ActivitySummary }) {
  return (
    <section aria-label="Activity" className="activity-strip">
      <div className={summary.currentStreak > 0 ? 'streak-hero is-live' : 'streak-hero'}>
        <p className="streak-number">{summary.currentStreak}</p>
        <p className="streak-label">day streak</p>
        <p className="streak-note hint">{streakNote(summary)}</p>
      </div>
      <dl className="stats-grid">
        <Stat label="Reviewed today" value={summary.reviewedToday} />
        <Stat label="Accuracy today" value={formatPercent(summary.accuracyToday)} />
        <Stat label="Days studied (7d)" value={summary.daysStudiedLast7} />
        <Stat label="Days studied (30d)" value={summary.daysStudiedLast30} />
        <Stat label="Last studied" value={formatLastStudied(summary.lastStudiedAt)} />
      </dl>
    </section>
  );
}
