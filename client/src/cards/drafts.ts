import type { BatchFailure, CardValidationError } from '../api.js';

export interface Draft {
  key: number;
  spanishText: string;
  englishText: string;
  errors: CardValidationError[];
}

export interface DraftsState {
  nextKey: number;
  drafts: Draft[];
}

export const initialDraftsState: DraftsState = { nextKey: 1, drafts: [] };

export type DraftsAction =
  | { type: 'add' }
  | { type: 'update'; key: number; field: 'spanishText' | 'englishText'; value: string }
  | { type: 'remove'; key: number }
  | { type: 'batchSaved'; submittedKeys: number[]; failures: BatchFailure[] };

export function draftsReducer(state: DraftsState, action: DraftsAction): DraftsState {
  switch (action.type) {
    case 'add':
      return {
        nextKey: state.nextKey + 1,
        drafts: [
          ...state.drafts,
          { key: state.nextKey, spanishText: '', englishText: '', errors: [] },
        ],
      };
    case 'update':
      return {
        ...state,
        drafts: state.drafts.map((draft) =>
          draft.key === action.key
            ? {
                ...draft,
                [action.field]: action.value,
                errors: draft.errors.filter((error) => error.field !== action.field),
              }
            : draft,
        ),
      };
    case 'remove':
      return { ...state, drafts: state.drafts.filter((draft) => draft.key !== action.key) };
    case 'batchSaved': {
      // After a batch save only the drafts that failed validation remain,
      // annotated with their errors. Saved and empty drafts disappear.
      const errorsByKey = new Map<number, CardValidationError[]>();
      for (const failure of action.failures) {
        const key = action.submittedKeys[failure.index];
        if (key !== undefined) {
          errorsByKey.set(key, failure.errors);
        }
      }
      return {
        ...state,
        drafts: state.drafts
          .filter((draft) => errorsByKey.has(draft.key))
          .map((draft) => ({ ...draft, errors: errorsByKey.get(draft.key) ?? [] })),
      };
    }
  }
}

export function isDraftBlank(draft: Draft): boolean {
  return draft.spanishText.trim() === '' && draft.englishText.trim() === '';
}

// Entirely blank drafts (e.g. an extra row added by accident) are skipped
// rather than submitted as validation failures.
export function submittableDrafts(drafts: Draft[]): Draft[] {
  return drafts.filter((draft) => !isDraftBlank(draft));
}
