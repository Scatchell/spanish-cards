import { useEffect, useState } from 'react';

// Matches the server-side CARD_TEXT_MAX_LENGTH and DraftCardRow's input cap.
const CARD_TEXT_MAX_LENGTH = 70;

interface EditableSentenceProps {
  text: string;
  // Persists the new text; rejects (throws) on failure so we can revert.
  onSave: (newText: string) => Promise<void>;
  className?: string;
  // Describes which sentence this edits, e.g. "Spanish prompt"; used for the
  // edit button's accessible label ("Edit Spanish prompt").
  ariaLabel: string;
  // Optional aria-label for the sentence text itself (e.g. "Prompt"), applied
  // to the same node `className` is, so it never affects that node's text.
  sentenceAriaLabel?: string;
}

// One inline editor used for every editable sentence in Train/Learn: a pencil
// toggles a single-line input that saves on Enter/blur and reverts on failure.
// It never recomputes anything about the review in progress — it only swaps the
// displayed text and tells the parent to patch its local card copy on success.
export function EditableSentence({
  text,
  onSave,
  className,
  ariaLabel,
  sentenceAriaLabel,
}: EditableSentenceProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the displayed/edit value in sync if the parent's text changes out
  // from under us (e.g. the card is swapped without remounting).
  useEffect(() => {
    if (!editing) {
      setValue(text);
    }
  }, [text, editing]);

  async function commit() {
    if (saving) {
      return;
    }
    const trimmed = value.trim();
    // An empty or unchanged value is a no-op cancel, not a save or a failure.
    if (trimmed === '' || trimmed === text) {
      setEditing(false);
      setValue(text);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setValue(text);
      setError('Could not save — reverted.');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    // The pencil button is a sibling of the className'd text node, never a
    // descendant of it — callers (and e2e specs) select that class expecting
    // its full text to be exactly the sentence, with no edit-affordance noise.
    return (
      <span className="editable-sentence">
        <span className={className} aria-label={sentenceAriaLabel}>
          {text}
        </span>
        <button
          type="button"
          className="edit-sentence-button"
          aria-label={`Edit ${ariaLabel}`}
          title={`Edit ${ariaLabel}`}
          onClick={() => {
            setValue(text);
            setError(null);
            setEditing(true);
          }}
        >
          ✎
        </button>
        {error && <span className="field-error">{error}</span>}
      </span>
    );
  }

  return (
    <span className="editable-sentence">
      <input
        // Carries the same className as the view-mode text span (e.g.
        // "train-prompt") so the font size doesn't jump when toggling modes.
        className={className ? `edit-sentence-input ${className}` : 'edit-sentence-input'}
        autoFocus
        value={value}
        maxLength={CARD_TEXT_MAX_LENGTH}
        disabled={saving}
        aria-label={`Edit ${ariaLabel}`}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          // Keep page-level Space/digit/E shortcuts from firing while typing.
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
            setValue(text);
            setError(null);
          }
        }}
        onBlur={() => {
          void commit();
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
