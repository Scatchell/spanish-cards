import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Card } from '../api.js';
import { ApiError, deleteCardById, listCards, logout, saveCardBatch } from '../api.js';
import { formatDueStatus } from '../format.js';
import { draftsReducer, initialDraftsState, submittableDrafts } from './drafts.js';
import { DraftCardRow } from './DraftCardRow.js';

export const NEW_CARD_SHORTCUT_LABEL = 'Shift+Enter';

export function CardsPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftsState, dispatch] = useReducer(draftsReducer, initialDraftsState);
  const [pendingFocusKey, setPendingFocusKey] = useState<number | null>(null);
  const spanishInputs = useRef(new Map<number, HTMLInputElement>());

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
      .then(setCards)
      .catch((err) => {
        if (!handleUnauthenticated(err)) {
          setLoadError('Could not load cards');
        }
      });
  }, [handleUnauthenticated]);

  const addDraft = useCallback(() => {
    setPendingFocusKey(null);
    dispatch({ type: 'add' });
  }, []);

  // Focus the Spanish input of the most recently added draft.
  useEffect(() => {
    const lastDraft = draftsState.drafts[draftsState.drafts.length - 1];
    if (lastDraft && pendingFocusKey !== lastDraft.key) {
      spanishInputs.current.get(lastDraft.key)?.focus();
      setPendingFocusKey(lastDraft.key);
    }
  }, [draftsState.drafts, pendingFocusKey]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey || event.key !== 'Enter') return;
      const target = event.target as HTMLElement;
      // Buttons activate on Enter; guard against double-triggering (click + shortcut).
      if (target.tagName === 'BUTTON') return;
      event.preventDefault();
      addDraft();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addDraft]);

  async function handleSaveAll() {
    const toSubmit = submittableDrafts(draftsState.drafts);
    if (toSubmit.length === 0 || saving) {
      return;
    }
    setSaving(true);
    try {
      const result = await saveCardBatch(
        toSubmit.map(({ spanishText, englishText }) => ({ spanishText, englishText })),
      );
      setCards((existing) => [...result.saved, ...existing]);
      dispatch({
        type: 'batchSaved',
        submittedKeys: toSubmit.map((draft) => draft.key),
        failures: result.failures,
      });
    } catch (err) {
      if (!handleUnauthenticated(err)) {
        setLoadError('Could not save cards');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(card: Card) {
    if (!window.confirm(`Delete "${card.spanishText}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteCardById(card.id);
      setCards((existing) => existing.filter((c) => c.id !== card.id));
    } catch (err) {
      if (!handleUnauthenticated(err)) {
        setLoadError('Could not delete card');
      }
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  const submittableCount = submittableDrafts(draftsState.drafts).length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Spanish Cards</h1>
        <div className="header-actions">
          <Link to="/train" className="train-link">
            Train
          </Link>
          <Link to="/progress" className="back-link">
            Progress
          </Link>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main>
        <section className="drafts-section" aria-label="New cards">
          <div className="section-header">
            <h2>New cards</h2>
            <button type="button" onClick={addDraft}>
              + Add card <span className="shortcut-hint">({NEW_CARD_SHORTCUT_LABEL})</span>
            </button>
          </div>

          {draftsState.drafts.length === 0 ? (
            <p className="hint">
              Add draft cards, then save them all at once. {NEW_CARD_SHORTCUT_LABEL} adds a card.
            </p>
          ) : (
            <ul className="card-grid draft-grid">
              {draftsState.drafts.map((draft) => (
                <DraftCardRow
                  key={draft.key}
                  draft={draft}
                  onChange={(field, value) => dispatch({ type: 'update', key: draft.key, field, value })}
                  onRemove={() => dispatch({ type: 'remove', key: draft.key })}
                  spanishInputRef={(el) => {
                    if (el) {
                      spanishInputs.current.set(draft.key, el);
                    } else {
                      spanishInputs.current.delete(draft.key);
                    }
                  }}
                />
              ))}
            </ul>
          )}

          {draftsState.drafts.length > 0 && (
            <button
              type="button"
              className="save-all"
              onClick={handleSaveAll}
              disabled={saving || submittableCount === 0}
            >
              {saving
                ? 'Saving…'
                : `Save ${submittableCount} card${submittableCount === 1 ? '' : 's'}`}
            </button>
          )}
        </section>

        <section aria-label="Deck">
          <div className="section-header">
            <h2>Deck ({cards.length})</h2>
          </div>
          {loadError && (
            <p className="form-error" role="alert">
              {loadError}
            </p>
          )}
          {cards.length === 0 ? (
            <p className="hint">No cards yet — add your first card above.</p>
          ) : (
            <ul className="card-grid">
              {cards.map((card) => (
                <li key={card.id} className="card existing-card">
                  <div className="card-text">
                    <span className="card-spanish">{card.spanishText}</span>
                    <span className="card-english">{card.englishText}</span>
                    <CardDueStatus card={card} />
                  </div>
                  <button
                    type="button"
                    className="danger subtle"
                    onClick={() => handleDelete(card)}
                    aria-label={`Delete card ${card.spanishText}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

// Due/learning status line for a saved card. A card that has never been
// reviewed is "New" (always due now); reviewed cards show when they are next
// due, highlighted when due now.
function CardDueStatus({ card }: { card: Card }) {
  const status = formatDueStatus(card.due, new Date());
  const dueNow = status === 'Due now';
  return (
    <span className={dueNow ? 'due-status due-now' : 'due-status'}>
      {card.reviewed ? status : 'New · due now'}
    </span>
  );
}
