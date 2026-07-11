import { useCallback, useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ReviewRating, TrainingScope } from '../api.js';
import { ApiError, fetchTrainingQueue, submitReview, updateCardText } from '../api.js';
import { FlipCard } from '../cards/FlipCard.js';
import { EditableSentence } from '../cards/EditableSentence.js';
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
import {
  currentCard,
  patchCard,
  position,
  recordGraded,
  resolveRetry,
  startSession,
  totalCount,
} from './queue.js';
import type { TrainingSession } from './queue.js';

type LoadState = 'loading' | 'ready' | 'error';

interface Reveal {
  submitted: string;
  result: AnswerCheckResult;
}

export function TrainPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [session, setSession] = useState<TrainingSession>(() => startSession([]));
  const [studyingAhead, setStudyingAhead] = useState(false);
  const [direction, setDirection] = useState<Direction>(loadDirection);
  const [typed, setTyped] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [answerOverride, setAnswerOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const answerInput = useRef<HTMLInputElement>(null);

  const current = currentCard(session);
  const isRetry = current?.kind === 'retry';
  const card = current?.card;

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
          setSession(startSession(cards));
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

  useEffect(() => {
    if (card && !reveal && !isRetry) {
      answerInput.current?.focus();
    }
  }, [card, reveal, isRetry]);

  useEffect(() => {
    if (!card || !reveal || explainOpen || !canExplain(card)) return;
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
  }, [card, reveal, explainOpen]);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!card || reveal) return;
    setAnswerOverride(null);
    setReveal({ submitted: typed, result: checkAnswer(typed, answerText(card, direction)) });
  }

  const handleRate = useCallback(
    async (rating: ReviewRating) => {
      if (!card || !reveal || saving) return;
      const detectedCorrect = reveal.result.verdict !== 'incorrect';
      setSaving(true);
      try {
        await submitReview({
          cardId: card.id,
          rating,
          direction,
          verdict: reveal.result.verdict,
          submittedText: reveal.submitted,
        });
        setSession((s) =>
          recordGraded(s, {
            detectedCorrect,
            requeueAsRetry: rating === 'again',
          }),
        );
        setReveal(null);
        setAnswerOverride(null);
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
    [card, reveal, saving, direction, handleUnauthenticated],
  );

  // Persists a single field's text for a card, then patches the local session so
  // the correction shows for the rest of the session. Throws on failure so
  // EditableSentence reverts and surfaces the error; never touches schedule.
  async function saveCardField(
    field: 'spanishText' | 'englishText',
    newText: string,
  ) {
    if (!card) return;
    await updateCardText(card.id, {
      spanishText: field === 'spanishText' ? newText : card.spanishText,
      englishText: field === 'englishText' ? newText : card.englishText,
    });
    setSession((s) => patchCard(s, card.id, { [field]: newText }));
  }

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
  const cardPosition = position(session);
  const cardTotal = totalCount(session);
  // Which card field each slot edits, given the current direction.
  const promptField = direction === 'spanish-to-english' ? 'spanishText' : 'englishText';
  const answerField = direction === 'spanish-to-english' ? 'englishText' : 'spanishText';
  const promptLabel = direction === 'spanish-to-english' ? 'Spanish prompt' : 'English prompt';
  const answerLabel = direction === 'spanish-to-english' ? 'English answer' : 'Spanish answer';

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

        {loadState === 'ready' && card && (
          <section className="train-card" aria-label="Training card">
            <div className="train-meta">
              <span className="queue-count">
                Card {cardPosition} of {cardTotal}
                {isRetry ? (
                  <em className="retry-badge"> · second chance</em>
                ) : studyingAhead ? (
                  <em className="ahead-badge"> · extra practice (ahead of schedule)</em>
                ) : (
                  ' scheduled'
                )}
              </span>
              {!isRetry && (
                <button
                  type="button"
                  className="secondary direction-toggle"
                  onClick={toggleDirection}
                  disabled={reveal !== null}
                >
                  {direction === 'spanish-to-english' ? 'Spanish → English' : 'English → Spanish'}
                </button>
              )}
            </div>

            {isRetry ? (
              <FlipCard
                card={card}
                direction={direction}
                onRemembered={() => {
                  setSession((s) => resolveRetry(s, { remembered: true }));
                  setTyped('');
                  setAnswerOverride(null);
                }}
                onStillLearning={() => {
                  setSession((s) => resolveRetry(s, { remembered: false }));
                  setTyped('');
                  setAnswerOverride(null);
                }}
                onSavePrompt={(newText) => saveCardField(promptField, newText)}
                onSaveAnswer={(newText) => saveCardField(answerField, newText)}
              />
            ) : (
              <>
                <EditableSentence
                  className="train-prompt"
                  text={promptText(card, direction)}
                  ariaLabel={promptLabel}
                  sentenceAriaLabel="Prompt"
                  onSave={(newText) => saveCardField(promptField, newText)}
                />

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
                    <AnswerReveal
                      submitted={reveal.submitted}
                      result={reveal.result}
                      answerOverride={answerOverride}
                      answerAriaLabel={answerLabel}
                      onSaveAnswer={(newText) =>
                        saveCardField(answerField, newText).then(() =>
                          setAnswerOverride(newText),
                        )
                      }
                    />
                    {canExplain(card) && (
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
                        cardId={card.id}
                        spanishText={card.spanishText}
                        englishText={card.englishText}
                        onClose={() => setExplainOpen(false)}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </section>
        )}

        {loadState === 'ready' && !card && !studyingAhead && (
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

        {loadState === 'ready' && !card && studyingAhead && (
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

function SessionSummary({
  session,
  ahead = false,
}: {
  session: { reviewed: number; correct: number };
  ahead?: boolean;
}) {
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
