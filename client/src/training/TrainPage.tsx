import { useCallback, useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ReviewRating, TrainingCard, TrainingScope } from '../api.js';
import { ApiError, fetchTrainingQueue, submitReview } from '../api.js';
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

export function TrainPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [queue, setQueue] = useState<TrainingCard[]>([]);
  const [studyingAhead, setStudyingAhead] = useState(false);
  const [direction, setDirection] = useState<Direction>(loadDirection);
  const [typed, setTyped] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [saving, setSaving] = useState(false);
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

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!currentCard || reveal) return;
    setReveal({ submitted: typed, result: checkAnswer(typed, answerText(currentCard, direction)) });
  }

  const handleRate = useCallback(
    async (rating: ReviewRating) => {
      if (!currentCard || saving) return;
      setSaving(true);
      try {
        await submitReview(currentCard.id, rating);
        setQueue((cards) => cards.slice(1));
        setReveal(null);
        setTyped('');
      } catch (err) {
        if (!handleUnauthenticated(err)) {
          setLoadState('error');
        }
      } finally {
        setSaving(false);
      }
    },
    [currentCard, saving, handleUnauthenticated],
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

  const isCorrect =
    reveal !== null && reveal.result.verdict !== 'incorrect';

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
                {queue.length} card{queue.length === 1 ? '' : 's'} left
                {studyingAhead && <em className="ahead-badge"> · extra practice (ahead of schedule)</em>}
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
                <RatingBar
                  allowAgain={!isCorrect}
                  emphasized={isCorrect ? 'good' : 'again'}
                  disabled={saving}
                  onRate={handleRate}
                />
              </>
            )}
          </section>
        )}

        {loadState === 'ready' && !currentCard && !studyingAhead && (
          <section className="train-done" aria-label="Training complete">
            <h2>All done!</h2>
            <p>You've finished every card scheduled for now. 🎉</p>
            <button type="button" onClick={continueStudyingAhead}>
              Continue studying ahead of schedule
            </button>
          </section>
        )}

        {loadState === 'ready' && !currentCard && studyingAhead && (
          <section className="train-done" aria-label="Nothing left to study">
            <h2>Nothing left to study</h2>
            <p>There are no more cards to practice right now.</p>
            <Link to="/">Back to cards</Link>
          </section>
        )}
      </main>
    </div>
  );
}
