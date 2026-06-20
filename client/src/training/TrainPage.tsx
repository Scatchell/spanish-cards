import { useCallback, useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ReviewRating, TrainingCard, TrainingScope } from '../api.js';
import { ApiError, fetchTrainingQueue, submitReview } from '../api.js';
import { canExplain } from '../explain/canExplain.js';
import { ExplainButton } from '../explain/ExplainButton.js';
import { ExplanationModal } from '../explain/ExplanationModal.js';
import { formatPercent } from '../format.js';
import type { AnswerCheckResult } from './answer-check.js';
import { checkAnswer } from './answer-check.js';
import type { Direction } from './direction.js';
import { answerText, loadDirection, oppositeDirection, promptText, saveDirection } from './direction.js';
import { AnswerReveal } from './AnswerReveal.js';
import { RatingBar } from './RatingBar.js';

type LoadState = 'loading' | 'ready' | 'error';

interface Reveal {
  submitted: string;
  result: AnswerCheckResult;
}

// Per-queue-load stats: reset when a session starts (scheduled cards or a
// continue-studying batch), summarized on the done screen.
interface Session {
  total: number;
  reviewed: number;
  correct: number;
}

export function TrainPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [queue, setQueue] = useState<TrainingCard[]>([]);
  const [session, setSession] = useState<Session>({ total: 0, reviewed: 0, correct: 0 });
  const [studyingAhead, setStudyingAhead] = useState(false);
  const [direction, setDirection] = useState<Direction>(loadDirection);
  const [typed, setTyped] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [saving, setSaving] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const answerInput = useRef<HTMLInputElement>(null);

  const currentCard: TrainingCard | undefined = queue[0];

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

  const loadQueue = useCallback(
    (scope: TrainingScope) => {
      setLoadState('loading');
      fetchTrainingQueue(scope)
        .then((cards) => {
          setQueue(cards);
          setSession({ total: cards.length, reviewed: 0, correct: 0 });
          setLoadState('ready');
        })
        .catch((err) => {
          if (!handleUnauthenticated(err)) {
            setLoadState('error');
          }
        });
    },
    [handleUnauthenticated],
  );

  useEffect(() => {
    loadQueue('due');
  }, [loadQueue]);

  // Each new card starts in the answering state with a focused empty input.
  useEffect(() => {
    if (currentCard && !reveal) {
      answerInput.current?.focus();
    }
  }, [currentCard, reveal]);

  useEffect(() => {
    if (!currentCard || !reveal || explainOpen || !canExplain(currentCard)) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'KeyE') {
        event.preventDefault();
        setExplainOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentCard, reveal, explainOpen]);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!currentCard || reveal) return;
    setReveal({ submitted: typed, result: checkAnswer(typed, answerText(currentCard, direction)) });
  }

  const handleRate = useCallback(
    async (rating: ReviewRating) => {
      if (!currentCard || !reveal || saving) return;
      const detectedCorrect = reveal.result.verdict !== 'incorrect';
      setSaving(true);
      try {
        await submitReview({
          cardId: currentCard.id,
          rating,
          direction,
          verdict: reveal.result.verdict,
          submittedText: reveal.submitted,
        });
        setQueue((cards) => cards.slice(1));
        setSession((s) => ({
          ...s,
          reviewed: s.reviewed + 1,
          correct: s.correct + (detectedCorrect ? 1 : 0),
        }));
        setReveal(null);
        setTyped('');
        setExplainOpen(false);
      } catch (err) {
        if (!handleUnauthenticated(err)) {
          setLoadState('error');
        }
      } finally {
        setSaving(false);
      }
    },
    [currentCard, reveal, saving, direction, handleUnauthenticated],
  );

  function toggleDirection() {
    const next = oppositeDirection(direction);
    saveDirection(next);
    setDirection(next);
    setTyped('');
    answerInput.current?.focus();
  }

  function continueStudyingAhead() {
    setStudyingAhead(true);
    loadQueue('ahead');
  }

  const isCorrect = reveal !== null && reveal.result.verdict !== 'incorrect';
  const cardPosition = session.total - queue.length + 1;

  return (
    <div className="app-shell train-page">
      <header className="app-header">
        <h1>Training</h1>
        <Link to="/" className="back-link">
          Back to cards
        </Link>
      </header>

      <main>
        {loadState === 'loading' && <p className="hint">Loading cards…</p>}
        {loadState === 'error' && (
          <p className="form-error" role="alert">
            Something went wrong. <button type="button" className="secondary" onClick={() => loadQueue(studyingAhead ? 'ahead' : 'due')}>Retry</button>
          </p>
        )}

        {loadState === 'ready' && currentCard && (
          <section className="train-card" aria-label="Training card">
            <div className="train-meta">
              <span className="queue-count">
                Card {cardPosition} of {session.total}
                {studyingAhead ? (
                  <em className="ahead-badge"> · extra practice (ahead of schedule)</em>
                ) : (
                  ' scheduled'
                )}
              </span>
              <button
                type="button"
                className="secondary direction-toggle"
                onClick={toggleDirection}
                disabled={reveal !== null}
              >
                {direction === 'spanish-to-english' ? 'Spanish → English' : 'English → Spanish'}
              </button>
            </div>

            <p className="train-prompt" aria-label="Prompt">
              {promptText(currentCard, direction)}
            </p>

            {reveal === null ? (
              <form onSubmit={handleSubmit}>
                <label className="answer-label">
                  Your answer ({direction === 'spanish-to-english' ? 'English' : 'Spanish'})
                  <input
                    ref={answerInput}
                    type="text"
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <p className="hint">Press Enter to check — leave empty if you don't remember.</p>
              </form>
            ) : (
              <>
                <AnswerReveal submitted={reveal.submitted} result={reveal.result} />
                {canExplain(currentCard) && (
                  <ExplainButton onClick={() => setExplainOpen(true)} />
                )}
                <RatingBar
                  allowAgain={!isCorrect}
                  emphasized={isCorrect ? 'good' : 'again'}
                  disabled={saving || explainOpen}
                  onRate={handleRate}
                />
                {explainOpen && (
                  <ExplanationModal
                    cardId={currentCard.id}
                    spanishText={currentCard.spanishText}
                    englishText={currentCard.englishText}
                    onClose={() => setExplainOpen(false)}
                  />
                )}
              </>
            )}
          </section>
        )}

        {loadState === 'ready' && !currentCard && !studyingAhead && (
          <section className="train-done" aria-label="Training complete">
            <h2>All done — great work! 🎉</h2>
            <p>You've finished every card scheduled for now.</p>
            <SessionSummary session={session} />
            <button type="button" onClick={continueStudyingAhead}>
              Continue studying ahead of schedule
            </button>
            <Link to="/progress">See your progress</Link>
          </section>
        )}

        {loadState === 'ready' && !currentCard && studyingAhead && (
          <section className="train-done" aria-label="Nothing left to study">
            <h2>Nothing left to study</h2>
            <p>There are no more cards to practice right now.</p>
            <SessionSummary session={session} ahead />
            <Link to="/progress">See your progress</Link>
            <Link to="/">Back to cards</Link>
          </section>
        )}
      </main>
    </div>
  );
}

function SessionSummary({ session, ahead = false }: { session: Session; ahead?: boolean }) {
  if (session.reviewed === 0) {
    return null;
  }
  return (
    <p className="session-summary">
      {ahead ? 'Extra practice' : 'This session'}: {session.reviewed} card
      {session.reviewed === 1 ? '' : 's'} reviewed, {session.correct} correct (
      {formatPercent(session.correct / session.reviewed)}).
    </p>
  );
}
