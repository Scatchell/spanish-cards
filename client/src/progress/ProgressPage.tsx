import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProgressReport } from '../api.js';
import { ApiError, fetchProgress, logout } from '../api.js';
import { HeaderMenu } from '../nav/HeaderMenu.js';
import {
  AccountLink,
  BackLink,
  HeaderSeparator,
  LearnLink,
  LogoutButton,
  MistakesLink,
  TrainLink,
} from '../nav/HeaderItems.js';
import { AccuracyTrend } from './AccuracyTrend.js';
import { ActivityStrip } from './ActivityStrip.js';
import { DeckSection } from './DeckSection.js';
import { RecentMistakes } from './RecentMistakes.js';

type LoadState = { status: 'loading' | 'error' } | { status: 'ready'; report: ProgressReport };

export function ProgressPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(() => {
    setLoadState({ status: 'loading' });
    fetchProgress()
      .then((report) => setLoadState({ status: 'ready', report }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          onLoggedOut();
        } else {
          setLoadState({ status: 'error' });
        }
      });
  }, [onLoggedOut]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  return (
    <div className="app-shell progress-page">
      <header className="app-header">
        <h1>Progress</h1>
        <HeaderMenu>
          <BackLink to="/" destination="cards" />
          <HeaderSeparator />
          <LearnLink />
          <TrainLink />
          <MistakesLink />
          <HeaderSeparator />
          <AccountLink />
          <LogoutButton onClick={handleLogout} />
        </HeaderMenu>
      </header>

      <main>
        {loadState.status === 'loading' && <p className="hint">Loading progress…</p>}
        {loadState.status === 'error' && (
          <p className="form-error" role="alert">
            Something went wrong.{' '}
            <button type="button" className="secondary" onClick={load}>
              Retry
            </button>
          </p>
        )}
        {loadState.status === 'ready' && <ProgressReportView report={loadState.report} />}
      </main>
    </div>
  );
}

function ProgressReportView({ report }: { report: ProgressReport }) {
  return (
    <>
      <ActivityStrip summary={report.summary} />

      <section aria-label="Accuracy trend">
        <h2>Accuracy</h2>
        {report.summary.lastStudiedAt === null ? (
          <p className="hint">
            No reviews yet — <Link to="/train">train some cards</Link> to start building history.
          </p>
        ) : (
          <AccuracyTrend trend={report.trend} />
        )}
      </section>

      <DeckSection deck={report.deck} last7Days={report.trend.last7Days} />
      <RecentMistakes items={report.recentMistakes} />
    </>
  );
}
