import { describe, expect, it } from 'vitest';
import type { DraftsState } from './drafts.js';
import { draftsReducer, initialDraftsState, isDraftBlank, submittableDrafts } from './drafts.js';

function stateWithDrafts(count: number): DraftsState {
  let state = initialDraftsState;
  for (let i = 0; i < count; i += 1) {
    state = draftsReducer(state, { type: 'add' });
  }
  return state;
}

describe('draftsReducer', () => {
  it('adds drafts with unique keys', () => {
    const state = stateWithDrafts(2);
    expect(state.drafts.map((draft) => draft.key)).toEqual([1, 2]);
    expect(state.nextKey).toBe(3);
  });

  it('updates a field and clears its errors while keeping other field errors', () => {
    let state = stateWithDrafts(1);
    state = {
      ...state,
      drafts: [
        {
          ...state.drafts[0]!,
          errors: [
            { field: 'spanishText', message: 'Spanish text is required' },
            { field: 'englishText', message: 'English text is required' },
          ],
        },
      ],
    };
    state = draftsReducer(state, { type: 'update', key: 1, field: 'spanishText', value: 'hola' });
    expect(state.drafts[0]?.spanishText).toBe('hola');
    expect(state.drafts[0]?.errors).toEqual([
      { field: 'englishText', message: 'English text is required' },
    ]);
  });

  it('removes a draft by key', () => {
    const state = draftsReducer(stateWithDrafts(2), { type: 'remove', key: 1 });
    expect(state.drafts.map((draft) => draft.key)).toEqual([2]);
  });

  it('keeps only failed drafts after a batch save, annotated with errors', () => {
    let state = stateWithDrafts(3);
    state = draftsReducer(state, { type: 'update', key: 1, field: 'spanishText', value: 'hola' });
    state = draftsReducer(state, { type: 'update', key: 1, field: 'englishText', value: 'hello' });
    state = draftsReducer(state, { type: 'update', key: 2, field: 'spanishText', value: 'gato' });

    // Drafts 1 and 2 were submitted; the server reports index 1 (key 2) failed.
    const errors = [{ field: 'englishText' as const, message: 'English text is required' }];
    state = draftsReducer(state, {
      type: 'batchSaved',
      submittedKeys: [1, 2],
      failures: [{ index: 1, errors }],
    });

    expect(state.drafts.map((draft) => draft.key)).toEqual([2]);
    expect(state.drafts[0]?.errors).toEqual(errors);
  });

  it('clears all drafts when the whole batch saves', () => {
    let state = stateWithDrafts(2);
    state = draftsReducer(state, { type: 'batchSaved', submittedKeys: [1, 2], failures: [] });
    expect(state.drafts).toEqual([]);
  });
});

describe('submittableDrafts', () => {
  it('skips entirely blank drafts but keeps partially filled ones', () => {
    let state = stateWithDrafts(3);
    state = draftsReducer(state, { type: 'update', key: 1, field: 'spanishText', value: 'hola' });
    state = draftsReducer(state, { type: 'update', key: 3, field: 'englishText', value: '   ' });

    const submittable = submittableDrafts(state.drafts);
    expect(submittable.map((draft) => draft.key)).toEqual([1]);
    expect(isDraftBlank(state.drafts[2]!)).toBe(true);
  });
});
