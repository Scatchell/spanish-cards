import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PracticeSessionDto } from '../api.js';
import { ApiError, fetchPracticeSession, generatePracticeSession, logout } from '../api.js';
import { LearningSessionView } from '../learning/LearningSessionView.js';
import type { LearningSession } from '../learning/session.js';
import { markRemembered, markStillLearning, restartPass, startSession } from '../learning/session.js';
import {
  loadDirection,
  oppositeDirection,
  saveDirection,
  type Direction,
} from '../training/direction.js';
import { PracticeSourceModal } from './PracticeSourceModal.js';
import { sentencesToCards } from './practiceCards.js';

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

export function PracticeMistakePage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { categorizationId } = useParams<{ categorizationId: string }>();
  const id = Number(categorizationId);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [practiceSession, setPracticeSession] = useState<PracticeSessionDto | null>(null);
  const [learningSession, setLearningSession] = useState<LearningSession | null>(null);
  const [direction, setDirection] = useState<Direction>(loadDirection);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const handleUnauthenticated = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return true;
      }
      return false;
    },
    [onLoggedOut],
  );

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setLoadState('error');
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    fetchPracticeSession(id)
      .then((existing) => (existing ? existing : generatePracticeSession(id)))
      .then((loaded) => {
        if (cancelled) return;
        setPracticeSession(loaded);
        setLearningSession(startSession(sentencesToCards(loaded.sentences)));
        setLoadState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (handleUnauthenticated(err)) return;
        setLoadState(err instanceof ApiError && err.status === 503 ? 'unavailable' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, handleUnauthenticated]);

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  function toggleDirection() {
    const next = oppositeDirection(direction);
    saveDirection(next);
    setDirection(next);
  }

  const advance = useCallback((next: (session: LearningSession) => LearningSession) => {
    setLearningSession((current) => (current ? next(current) : current));
  }, []);

  function handleRegenerate() {
    if (!Number.isFinite(id)) return;
    setRegenerating(true);
    generatePracticeSession(id)
      .then((regenerated) => {
        setPracticeSession(regenerated);
        setLearningSession(startSession(sentencesToCards(regenerated.sentences)));
        setRegenerating(false);
        setSourceModalOpen(false);
      })
      .catch((err: unknown) => {
        if (handleUnauthenticated(err)) return;
        setRegenerating(false);
        setLoadState('error');
      });
  }

  const sourceModalFooter = practiceSession && (
    <div className="practice-source-link">
      <button type="button" className="secondary" onClick={() => setSourceModalOpen(true)}>
        See mistakes used to generate these cards
      </button>
      {sourceModalOpen && (
        <PracticeSourceModal
          session={practiceSession}
          regenerating={regenerating}
          onRegenerate={handleRegenerate}
          onClose={() => setSourceModalOpen(false)}
        />
      )}
    </div>
  );

  return (
    <div className={learningSession ? 'app-shell train-page' : 'app-shell'}>
      <header className="app-header">
        <h1>Practice this mistake</h1>
        <div className="header-actions">
          <Link to="/mistakes" className="back-link">
            Back to mistakes
          </Link>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main>
        {loadState === 'loading' && (
          <p className="hint">Gathering examples and generating practice sentences…</p>
        )}
        {loadState === 'unavailable' && (
          <p className="form-error" role="alert">
            Practice sentence generation isn't configured.
          </p>
        )}
        {loadState === 'error' && (
          <p className="form-error" role="alert">
            Something went wrong generating practice sentences.
          </p>
        )}

        {loadState === 'ready' && learningSession && (
          <LearningSessionView
            session={learningSession}
            direction={direction}
            onToggleDirection={toggleDirection}
            onRemembered={() => advance(markRemembered)}
            onStillLearning={() => advance((s) => markStillLearning(s))}
            editable={false}
            onKeepLearning={() => advance((s) => restartPass(s))}
            footer={sourceModalFooter}
          />
        )}
      </main>
    </div>
  );
}
