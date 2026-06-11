import type { Ref } from 'react';
import type { Draft } from './drafts.js';

interface DraftCardRowProps {
  draft: Draft;
  onChange: (field: 'spanishText' | 'englishText', value: string) => void;
  onRemove: () => void;
  spanishInputRef: Ref<HTMLInputElement>;
}

export function DraftCardRow({ draft, onChange, onRemove, spanishInputRef }: DraftCardRowProps) {
  const spanishError = draft.errors.find((error) => error.field === 'spanishText');
  const englishError = draft.errors.find((error) => error.field === 'englishText');

  return (
    <li className="card draft-card">
      <div className="draft-fields">
        <label>
          Spanish
          <input
            type="text"
            value={draft.spanishText}
            onChange={(event) => onChange('spanishText', event.target.value)}
            ref={spanishInputRef}
            maxLength={70}
            aria-invalid={spanishError !== undefined}
            placeholder="hola"
          />
          {spanishError && <span className="field-error">{spanishError.message}</span>}
        </label>
        <label>
          English
          <input
            type="text"
            value={draft.englishText}
            onChange={(event) => onChange('englishText', event.target.value)}
            maxLength={70}
            aria-invalid={englishError !== undefined}
            placeholder="hello"
          />
          {englishError && <span className="field-error">{englishError.message}</span>}
        </label>
      </div>
      <button type="button" className="danger subtle" onClick={onRemove} tabIndex={-1}>
        Remove
      </button>
    </li>
  );
}
