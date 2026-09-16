import { useState } from 'react';
import { EditableSentence } from './EditableSentence.js';

// Matches the server-side CARD_TEXT_MAX_LENGTH and DraftCardRow's input cap.
const CARD_TEXT_MAX_LENGTH = 70;
const MAX_ALTERNATES = 5;

export interface AlternateAnswerData {
  id: number;
  text: string;
}

interface EditableAnswerGroupProps {
  className?: string;
  primaryText: string;
  ariaLabel: string;
  onSavePrimary: (newText: string) => Promise<void>;
  alternates: AlternateAnswerData[];
  onAddAlternate: (text: string) => Promise<AlternateAnswerData>;
  onUpdateAlternate: (id: number, text: string) => Promise<void>;
  onDeleteAlternate: (id: number) => Promise<void>;
}

// Replaces the single-box EditableSentence wherever a field is the graded/
// revealed answer. Collapsed, it looks identical to EditableSentence (plain
// text + pencil); expanded, it shows the primary answer plus every alternate,
// each independently autosaving, mirroring EditableSentence's own
// save-on-blur/Enter and revert-on-empty semantics.
export function EditableAnswerGroup({
  className,
  primaryText,
  ariaLabel,
  onSavePrimary,
  alternates,
  onAddAlternate,
  onUpdateAlternate,
  onDeleteAlternate,
}: EditableAnswerGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  // Reuses EditableSentence's editRequest (Adopt's "force edit mode" hook)
  // so the primary answer opens already editable when the group expands.
  const [expandToken, setExpandToken] = useState(0);

  if (!expanded) {
    return (
      <span className="editable-sentence">
        <span className={className}>{primaryText}</span>
        <button
          type="button"
          className="edit-sentence-button"
          aria-label={`Edit ${ariaLabel}`}
          title={`Edit ${ariaLabel}`}
          onClick={() => {
            setExpanded(true);
            setExpandToken((token) => token + 1);
          }}
        >
          ✎
        </button>
      </span>
    );
  }

  return (
    <div className="answer-group">
      <p className="answer-group-label">Primary answer</p>
      <EditableSentence
        className={className}
        text={primaryText}
        ariaLabel={ariaLabel}
        sentenceAriaLabel="Correct answer"
        onSave={onSavePrimary}
        editRequest={{ value: primaryText, token: expandToken }}
      />

      <p className="answer-group-label">Alternative answers</p>
      <ul className="alternate-answer-list">
        {alternates.map((alt) => (
          <AlternateRow
            key={alt.id}
            text={alt.text}
            onSave={(text) => onUpdateAlternate(alt.id, text)}
            onDelete={() => onDeleteAlternate(alt.id)}
          />
        ))}
        {addingNew && (
          <AlternateRow
            text=""
            autoFocus
            onSave={async (text) => {
              await onAddAlternate(text);
              setAddingNew(false);
            }}
            onCancelEmpty={() => setAddingNew(false)}
          />
        )}
      </ul>
      {alternates.length < MAX_ALTERNATES && !addingNew && (
        <button type="button" className="secondary add-alternate-button" onClick={() => setAddingNew(true)}>
          + Add alternative
        </button>
      )}
      <button type="button" className="secondary done-editing-button" onClick={() => setExpanded(false)}>
        Done
      </button>
    </div>
  );
}

interface AlternateRowProps {
  text: string;
  autoFocus?: boolean;
  onSave: (text: string) => Promise<void>;
  onDelete?: () => void;
  onCancelEmpty?: () => void;
}

function AlternateRow({ text: initialText, autoFocus, onSave, onDelete, onCancelEmpty }: AlternateRowProps) {
  const [value, setValue] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    if (saving) return;
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === initialText) {
      if (trimmed === '' && onCancelEmpty) {
        onCancelEmpty();
        return;
      }
      setValue(initialText);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setValue(initialText);
      setError(err instanceof Error ? err.message : 'Could not save — reverted.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="alternate-answer-row">
      <input
        type="text"
        className="alternate-answer-input"
        value={value}
        autoFocus={autoFocus}
        maxLength={CARD_TEXT_MAX_LENGTH}
        disabled={saving}
        aria-label="Alternate answer"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          }
        }}
        onBlur={() => void commit()}
      />
      {onDelete && (
        <button type="button" className="delete-alternate-button" aria-label="Delete alternate answer" onClick={onDelete}>
          ✕
        </button>
      )}
      {error && <span className="field-error">{error}</span>}
    </li>
  );
}
