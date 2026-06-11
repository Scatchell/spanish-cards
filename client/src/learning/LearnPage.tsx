import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Card } from '../api.js';
import { ApiError, listCards, logout } from '../api.js';
import { CardDueStatus } from '../cards/CardDueStatus.js';
import type { Direction } from '../training/direction.js';
import {
  answerText,
  loadDirection,
  oppositeDirection,
  promptText,
  saveDirection,
} from '../training/direction.js';
import type { LearningSession } from './session.js';
import { currentCard, markRemembered, markStillLearning, restartPass, startSession } from './session.js';
import {
  allCardIds,
  cardIdsWithStatus,
  defaultSelection,
  dueNowCardIds,
  toggleCardId,
  withCardsIncluded,
} from './selection.js';

type LoadState = 'loading' | 'ready' | 'error';

const DIGIT_BY_CODE: Record<string, string> = {
  Digit1: '1',
  Numpad1: '1',
  Digit2: '2',
  Numpad2: '2',
};

// Learn is a preview flow, deliberately separate from Train: it never calls
// review APIs, so nothing here can change FSRS schedules, review history, or
// progress metrics. The session is ephemeral and resets on refresh.
export function LearnPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [session, setSession] = useState<LearningSession | null>(null);
  const [direction, setDirection] = useState<Direction>(loadDirection);
  const [showBack, setShowBack] = useState(false);

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
    listCards()
      .then((loaded) => {
        setCards(loaded);
        setSelected(defaultSelection(loaded, new Date()));
        setLoadState('ready');
      })
      .catch((err) => {
        if (!handleUnauthenticated(err)) {
          setLoadState('error');
        }
      });
  }, [handleUnauthenticated]);

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  function startLearning() {
    const selectedCards = cards.filter((card) => selected.has(card.id));
    if (selectedCards.length === 0) {
      return;
    }
    setShowBack(false);
    setSession(startSession(selectedCards));
  }

  const advance = useCallback((next: (session: LearningSession) => LearningSession) => {
    setShowBack(false);
    setSession((current) => (current ? next(current) : current));
  }, []);

  function toggleDirection() {
    const next = oppositeDirection(direction);
    saveDirection(next);
    setDirection(next);
    setShowBack(false);
  }

  const card = session ? currentCard(session) : undefined;
  const hasCard = card !== undefined;

  // Shortcuts while a card is shown: Space flips, 1 = Remembered,
  // 2 = Still learning. Space is intercepted even on a focused button so
  // flicking the answer back and forth never activates that button instead.
  useEffect(() => {
    if (!hasCard) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setShowBack((s) => !s);
        return;
      }
      const digit = /^[12]$/.test(event.key) ? event.key : DIGIT_BY_CODE[event.code];
      if (digit === '1') {
        event.preventDefault();
        advance(markRemembered);
      } else if (digit === '2') {
        event.preventDefault();
        advance((s) => markStillLearning(s));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasCard, advance]);

  return (
    <div className={session ? 'app-shell train-page' : 'app-shell'}>
      <header className="app-header">
        <h1>Learn</h1>
        <div className="header-actions">
          <Link to="/" className="back-link">
            Back to cards
          </Link>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main>
        {loadState === 'loading' && <p className="hint">Loading cards…</p>}
        {loadState === 'error' && (
          <p className="form-error" role="alert">
            Could not load cards.
          </p>
        )}

        {loadState === 'ready' && !session && (
          <SelectionScreen
            cards={cards}
            selected={selected}
            onSelectedChange={setSelected}
            onStart={startLearning}
          />
        )}

        {session && card && (
          <section className="train-card" aria-label="Learning card">
            <div className="train-meta">
              <span className="queue-count">
                Remembered {session.rememberedIds.length} of {session.selected.length}
              </span>
              <button type="button" className="secondary direction-toggle" onClick={toggleDirection}>
                {direction === 'spanish-to-english' ? 'Spanish → English' : 'English → Spanish'}
              </button>
            </div>

            <p className="train-prompt" aria-label="Prompt">
              {promptText(card, direction)}
            </p>

            {/* The answer text always occupies its slot so showing/hiding it
                never moves the buttons below. */}
            <p
              className={showBack ? 'learn-answer' : 'learn-answer concealed'}
              aria-label="Answer"
              aria-hidden={!showBack}
            >
              {answerText(card, direction)}
            </p>
            <button type="button" className="secondary" onClick={() => setShowBack((s) => !s)}>
              {showBack ? 'Hide answer' : 'Show answer'}{' '}
              <span className="shortcut-hint">(Space)</span>
            </button>

            <div className="learn-actions">
              <button type="button" onClick={() => advance(markRemembered)}>
                Remembered <span className="shortcut-hint">(1)</span>
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => advance((s) => markStillLearning(s))}
              >
                Still learning <span className="shortcut-hint">(2)</span>
              </button>
            </div>
          </section>
        )}

        {session && !card && (
          <section className="train-done" aria-label="Learning pass complete">
            <h2>Pass complete! 🎉</h2>
            <p>
              You remembered all {session.selected.length} card
              {session.selected.length === 1 ? '' : 's'} in this pass.
            </p>
            <button type="button" onClick={() => advance((s) => restartPass(s))}>
              Keep learning these cards
            </button>
            <Link to="/train" className="train-link">
              Start training
            </Link>
            <button type="button" className="secondary" onClick={() => setSession(null)}>
              Choose different cards
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function SelectionScreen({
  cards,
  selected,
  onSelectedChange,
  onStart,
}: {
  cards: Card[];
  selected: ReadonlySet<number>;
  onSelectedChange: (selected: ReadonlySet<number>) => void;
  onStart: () => void;
}) {
  if (cards.length === 0) {
    return (
      <p className="hint">
        No cards yet — <Link to="/">add some cards</Link> before learning.
      </p>
    );
  }

  return (
    <section aria-label="Choose cards to learn">
      <div className="section-header">
        <h2>
          Choose cards ({selected.size} of {cards.length} selected)
        </h2>
      </div>
      <p className="hint">
        Preview cards before training. Learning is practice only — it never changes your schedule
        or progress.
      </p>

      <div className="bulk-actions">
        <button
          type="button"
          className="secondary"
          onClick={() =>
            onSelectedChange(withCardsIncluded(selected, cardIdsWithStatus(cards, 'new', new Date())))
          }
        >
          Include new
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onSelectedChange(withCardsIncluded(selected, dueNowCardIds(cards, new Date())))}
        >
          Include due
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onSelectedChange(allCardIds(cards))}
        >
          Include all
        </button>
        <button type="button" className="secondary" onClick={() => onSelectedChange(new Set())}>
          Clear
        </button>
      </div>

      <ul className="card-grid">
        {cards.map((card) => {
          const isSelected = selected.has(card.id);
          return (
            <li key={card.id} className={isSelected ? 'card learn-card selected' : 'card learn-card'}>
              <label className="learn-card-label">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onSelectedChange(toggleCardId(selected, card.id))}
                  aria-label={`Select ${card.spanishText}`}
                />
                <span className="card-text">
                  <span className="card-spanish">{card.spanishText}</span>
                  <span className="card-english">{card.englishText}</span>
                  <CardDueStatus card={card} />
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="start-learning"
        onClick={onStart}
        disabled={selected.size === 0}
      >
        {selected.size === 0
          ? 'Select cards to learn'
          : `Start learning (${selected.size} card${selected.size === 1 ? '' : 's'})`}
      </button>
    </section>
  );
}
