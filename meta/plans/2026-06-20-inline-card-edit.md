---
type: plan
id: "2026-06-20-inline-card-edit"
title: "Inline Card Edit During Train/Learn Implementation Plan"
date: "2026-06-20T20:17:21+00:00"
author: "Anthony Scatchell"
producer: create-plan
status: draft
revision: "fd0394271de231da575fd2a6f9c57de6e5e8de85"
repository: "spanish-cards"
last_updated: "2026-06-20T20:17:21+00:00"
last_updated_by: "Anthony Scatchell"
schema_version: 1
---

# Inline Card Edit During Train/Learn Implementation Plan

## Overview

Add a small edit affordance next to each Spanish/English sentence shown during
Train and Learn, so the user can fix a slightly-off translation in place,
without leaving the flow, without disturbing the card's FSRS schedule, and
without losing the in-progress review/learning state.

## Current State Analysis

- `cards` (text) and `card_schedules` (FSRS state) are separate tables joined
  only by `card_id` (`server/src/cards/repository.ts:28-71`,
  `server/src/training/repository.ts:36-60`). No code path updates card text
  today after creation.
- The only card-mutating routes are `POST /api/cards/batch` (insert) and
  `DELETE /api/cards/:id` (`server/src/cards/routes.ts`). There is no update
  endpoint.
- `cards.updated_at` has an insert-time default but **no update trigger**
  (`server/migrations/1718000000000_create-cards.cjs:9`) — any update path
  must set it explicitly.
- `validateCardInput`/`normalizeCardInput`
  (`server/src/cards/validation.ts`) already validate per-field
  (required, single-line, ≤70 chars `CARD_TEXT_MAX_LENGTH`) and are reused
  by the batch-create path — the same functions are reusable here unchanged.
- `review_history.correct_text`/`submitted_text` are snapshotted at attempt
  time (`server/migrations/1772000000000_create-review-history.cjs`) and
  `reviews` rows don't reference text at all — editing card text cannot alter
  past analytics/progress records.
- `explanations` are cached by exact `(spanish_text, english_text)` pair with
  a unique constraint (`server/src/explanations/repository.ts:39-51`). After
  an edit, the old cached explanation becomes simply unreferenced (harmless);
  a new lookup under the new text will regenerate it. This is the desired
  behavior per user confirmation — no cleanup needed.
- **TrainPage** (`client/src/training/TrainPage.tsx`):
  - The prompt (`promptText(currentCard, direction)`) is rendered as plain
    text, always visible regardless of `reveal` state (lines 193-195).
  - Once revealed, `AnswerReveal` (`client/src/training/AnswerReveal.tsx`)
    renders `correctText`, a **diff reconstruction** built from
    `checkAnswer(typed, answerText(currentCard, direction))`
    (`client/src/training/answer-check.ts`), not a direct field render.
  - `RatingBar` is rendered below `AnswerReveal` and is independent of it —
    rating options (`again`/`hard`/`good`/`easy`) are computed from
    `isCorrect`, which itself comes from `reveal.result.verdict`, set once at
    reveal time and never recomputed afterward.
  - Per user direction: editing the correct-answer text should clear the
    diff/highlighting and just show the corrected plain text. The rating
    buttons already shown stay as they are — `reveal.result.verdict` is not
    recomputed, so `RatingBar`'s available options are unaffected by the
    edit.
- **LearnPage** (`client/src/learning/LearnPage.tsx`): both
  `promptText(card, direction)` (line 181) and `answerText(card, direction)`
  (line 191) are direct renders of the card object — no diff reconstruction
  involved.
- Card objects are held in plain client-side state arrays: `TrainPage`'s
  `queue: TrainingCard[]` (current card is `queue[0]`), `LearnPage`'s
  `LearningSession.selected`/`queue: Card[]` (`client/src/learning/session.ts`).
  An edit must patch the matching object by `id` wherever it appears; text
  edits never need to reorder anything since due/order is computed
  server-side at load time and is independent of text.
- Global keyboard shortcuts are already scoped to ignore focused
  inputs/textareas (`TrainPage.tsx:88-98` `KeyE` guard,
  `RatingBar.tsx:43-49` digit-shortcut guard, `LearnPage.tsx:113-136`
  Space/1/2/E handlers checking `event.target`). A new inline edit input must
  follow the same pattern: stop propagation / let the existing
  `target instanceof HTMLInputElement` guards skip it.
- No existing single-field PATCH client helper; `client/src/api.ts` has
  `saveCardBatch`, `deleteCardById` as the closest analogues, both using the
  shared `request<T>()` helper and `ApiError`.

### Key Discoveries:

- Schedule and history tables are already decoupled from card text — this
  feature is "just" a text update plus UI plumbing; no FSRS/scheduler changes
  of any kind are needed.
- The only nontrivial design decision (how to handle the diffed
  `AnswerReveal` correct-answer display) is resolved: edit shows the raw
  underlying text, saves automatically, and on success simply clears
  diff/highlighting and renders the corrected plain text. Rating buttons are
  unaffected because their availability was already fixed at reveal time.

## Desired End State

A user training or learning can click a small edit (pencil) control next to
any Spanish or English sentence currently on screen — the due-only prompt, or
the revealed/shown answer — type a correction, and press Enter (or blur) to
save it immediately. On success the corrected text is reflected for the rest
of the session (and persists). On failure, the field reverts to its previous
text and an inline error is shown; nothing else about training/learning state
changes. The card's FSRS schedule, review history, and progress metrics are
never touched by this feature.

**Verification**: edit a card's Spanish or English text from both Train and
Learn, in both "prompt only" and "both shown" states; confirm the database
`cards` row updates, `card_schedules`/`reviews`/`review_history` rows for that
card are untouched, and the explanation cache regenerates under the new text.

## What We're NOT Doing

- Not changing the FSRS scheduler, review submission, or progress metrics in
  any way.
- Not retroactively recomputing the answer-diff/verdict for the review
  already in progress when an edit happens mid-reveal.
- Not adding undo/version history for card text edits beyond the existing
  "revert to previous value on failure" behavior.
- Not deleting/invalidating old cached `explanations` rows — they're simply
  superseded by a new cache entry under the new text (per user confirmation).
- Not adding edit capability to the `CardsPage` deck list in this plan — that
  page can be addressed separately if wanted; this plan targets Train/Learn
  inline editing only. (It can reuse the same API/validation either way.)
- Not adding multi-line or rich text editing — same single-line, ≤70 char
  constraint as card creation.

## Implementation Approach

1. Add a server `PATCH /api/cards/:id` endpoint reusing existing validation.
2. Add a typed client API helper for it.
3. Build one shared `EditableSentence` component encapsulating
   view/edit-mode toggling, save-on-Enter/blur, revert-on-failure, and
   keyboard-shortcut-safe input handling.
4. Wire it into `TrainPage` (prompt slot, always; correct-answer slot,
   replacing the diffed text once edited) and `LearnPage` (prompt slot and
   answer slot).
5. Update local state (`queue`/`session`) by card id on successful save so
   the correction is visible without a refetch.

## Phase 1: Server — update endpoint

### Overview

Add the ability to update a single card's `spanishText`/`englishText` by id,
reusing existing validation and never touching schedule tables.

### Changes Required:

#### 1. Repository update function

**File**: `server/src/cards/repository.ts`
**Changes**: Add `updateCard(db, id, input: CardInput): Promise<Card | null>`
that runs `UPDATE cards SET spanish_text = $1, english_text = $2, updated_at = now() WHERE id = $3 RETURNING ...` (same `RETURNING`/join shape as `getCard`, or re-run `getCard` after the update to get `due`/`reviewed`). Returns `null` if no row matched (404 case).

```ts
export async function updateCard(
  db: DbQueryable,
  id: number,
  input: CardInput,
): Promise<Card | null> {
  const result = await db.query(
    `UPDATE cards SET spanish_text = $1, english_text = $2, updated_at = now()
     WHERE id = $3`,
    [input.spanishText, input.englishText, id],
  );
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getCard(db, id);
}
```

#### 2. Service-level validation wrapper

**File**: `server/src/cards/service.ts`
**Changes**: Add `updateCardText(id, input, updateCard): Promise<{ card: Card } | { errors: CardValidationError[] } | { notFound: true }>` mirroring the validate-then-persist shape of `saveCardBatch`, but for a single card (no batch/failures array needed).

```ts
export type UpdateCard = (id: number, input: CardInput) => Promise<Card | null>;

export type UpdateCardTextResult =
  | { ok: true; card: Card }
  | { ok: false; errors: CardValidationError[] }
  | { ok: false; notFound: true };

export async function updateCardText(
  id: number,
  input: CardInput,
  updateCard: UpdateCard,
): Promise<UpdateCardTextResult> {
  const errors = validateCardInput(input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const card = await updateCard(id, normalizeCardInput(input));
  if (!card) {
    return { ok: false, notFound: true };
  }
  return { ok: true, card };
}
```

#### 3. Route

**File**: `server/src/cards/routes.ts`
**Changes**: Add `router.patch('/:id', ...)`, parsing the same `{ spanishText, englishText }` body shape as the batch route's per-card parsing, validating the id like the existing `DELETE` route, and mapping the service result to HTTP status (`200` success, `400` validation errors, `404` not found).

```ts
router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Card id must be an integer' });
    return;
  }
  const input = parseCardInputBody(req.body);
  if (input === null) {
    res.status(400).json({ error: 'Body must be { spanishText, englishText }' });
    return;
  }
  const result = await updateCardText(id, input, (cardId, valid) => updateCard(pool, cardId, valid));
  if (!result.ok && 'notFound' in result) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }
  res.json({ card: result.card });
});
```

Extract the single-card body parsing (`spanishText`/`englishText` string
coercion) already inline in `parseBatchBody` into a small shared
`parseCardInputBody` helper used by both the batch and single-card paths, to
avoid duplicating the coercion logic.

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`
- [x] Server unit tests pass: `pnpm test`
- [ ] Linting passes (if configured): `pnpm lint` — no lint script configured in this repo

#### Manual Verification:

- [ ] `PATCH /api/cards/:id` with a valid body returns `200` and the updated
      card, with `due`/`reviewed` unchanged from before the edit.
- [ ] `PATCH` with an invalid id (non-integer) returns `400`.
- [ ] `PATCH` with an unknown id returns `404`.
- [ ] `PATCH` with blank/too-long/multi-line text returns `400` with
      per-field errors, matching the same messages as card creation.
- [ ] Querying `card_schedules`, `reviews`, `review_history` for the edited
      card before/after the edit shows no changes.

---

## Phase 2: Client API helper

### Overview

Add a typed client function for the new endpoint, matching existing
conventions in `client/src/api.ts`.

### Changes Required:

#### 1. API client

**File**: `client/src/api.ts`
**Changes**: Add `updateCardText(id: number, input: CardDraftInput): Promise<Card>` (throws `ApiError` on failure, same as every other helper here — no special-casing of 400 vs 404, callers branch on `err.status`).

```ts
export async function updateCardText(id: number, input: CardDraftInput): Promise<Card> {
  const { card } = await request<{ card: Card }>(`/api/cards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return card;
}
```

Note: on a `400`, the server returns `{ errors: CardValidationError[] }`
rather than `{ error: string }`. `request<T>()`'s error branch currently only
reads `body?.error`. The inline editor only ever shows one generic error
string per field anyway (see Phase 3), so this is fine as-is — no change to
`request<T>()` needed.

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`
- [x] Client unit tests pass (if any cover `api.ts`): `pnpm test`

#### Manual Verification:

- [ ] Calling `updateCardText` from the browser console against a running
      dev server updates the card and returns the new value.

---

## Phase 3: Shared `EditableSentence` component

### Overview

One component used in all four places (Train prompt, Train revealed answer,
Learn prompt, Learn answer) so edit/save/revert/error behavior is consistent
and implemented once.

### Changes Required:

#### 1. Component

**File**: `client/src/cards/EditableSentence.tsx` (new)
**Changes**: A component that:
- Renders the given `text` plus a small pencil/edit button (styled like
  `ExplainButton`, e.g. `.explain-button`-style transparent bordered button)
  next to it, in "view mode".
- On click, switches to "edit mode": a single `<input>` pre-filled with the
  current raw text, `maxLength={70}`, autofocused, text selected.
- On `Enter` (and on blur, since "save immediately... doesn't disrupt flow"
  implies no separate save button) with a changed, non-empty value: calls
  `onSave(newText)` (an async function supplied by the caller that performs
  the `updateCardText` PATCH for the correct field of the correct card).
  - `event.stopPropagation()` on the input's `keydown` so this never
    re-triggers the page-level Space/digit/E shortcuts in `TrainPage`/
    `LearnPage`/`RatingBar`.
- On `Escape`: cancel edit mode, discard the typed value, no request.
- While saving: input is disabled (brief, no spinner needed given local-DB
  latency — but disable to prevent double-submit on rapid Enter+blur).
- On success: exits edit mode, calls `onSaved(newText)` so the parent can
  update its local state (`queue`/`session`) by card id.
- On failure (`ApiError`): reverts the input/display to the original text
  (the value `EditableSentence` was first rendered with) and shows a small
  inline error (`<span className="field-error">`, the same class
  `DraftCardRow` already uses), auto-clearing on next edit attempt.
- If the value is unchanged or empty after trim, treat blur/Enter as a no-op
  cancel (no request, no error) — matches "if failure ... reverts" framing;
  an unedited save isn't a failure case to begin with.

```tsx
interface EditableSentenceProps {
  text: string;
  onSave: (newText: string) => Promise<void>;
  className?: string;
  ariaLabel: string;
}

export function EditableSentence({ text, onSave, className, ariaLabel }: EditableSentenceProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the displayed/edit value in sync if the parent's text changes
  // out from under us (e.g. card swapped without remount).
  useEffect(() => {
    if (!editing) setValue(text);
  }, [text, editing]);

  async function commit() {
    const trimmed = value.trim();
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
    return (
      <span className={className}>
        {text}
        <button type="button" className="edit-sentence-button" aria-label={`Edit ${ariaLabel}`}
          onClick={() => { setValue(text); setError(null); setEditing(true); }}>
          ✎
        </button>
      </span>
    );
  }

  return (
    <span className={className}>
      <input
        autoFocus
        value={value}
        maxLength={70}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setValue(text); setError(null); }
        }}
        onBlur={commit}
      />
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
```

Each caller (`TrainPage`/`LearnPage`) supplies an `onSave` that wraps
`updateCardText` with the full `{ spanishText, englishText }` pair — since
`EditableSentence` only edits one field's text at a time, the wrapper fills
in the *other* field from the current card object, e.g.:
`onSave={(newText) => updateCardText(card.id, direction === 'spanish-to-english' ? { spanishText: newText, englishText: card.englishText } : { spanishText: card.spanishText, englishText: newText }).then(() => { /* update local state */ })}`.

#### 2. Styling

**File**: `client/src/styles.css`
**Changes**: Add `.edit-sentence-button` (small, transparent, borderless or subtle-bordered, sized to sit inline next to `.train-prompt`/`.correct-answer`/`.learn-answer` text — follow the `.explain-button` pattern for visual weight) and ensure the edit-mode `<input>` inherits roughly the font-size of whichever text class it's replacing (`.train-prompt` is 1.6rem, `.correct-answer` 1.35rem, `.learn-answer` — check existing class — so the input doesn't visually jump in size when toggling modes).

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`

#### Manual Verification:

- [ ] Clicking edit, typing, pressing Enter saves and exits edit mode.
- [ ] Pressing Escape cancels without a network call (verify via devtools
      network tab).
- [ ] Blurring after a change also saves (not just Enter).
- [ ] Triggering a failure (e.g. stop the API, or temporarily edit to text
      forcing a 400 by exceeding length and bypassing `maxLength` via paste)
      reverts the displayed text and shows the inline error.
- [ ] The edit input does not trigger `RatingBar`'s digit shortcuts,
      `LearnPage`'s Space/1/2/E shortcuts, or `TrainPage`'s `E` shortcut while
      focused.

---

## Phase 4: Wire into TrainPage

### Overview

Add edit affordances to the prompt (always visible) and to the
revealed-answer slot (replacing the diffed `AnswerReveal` correct-answer
once edited), without touching rating logic.

### Changes Required:

#### 1. Prompt slot

**File**: `client/src/training/TrainPage.tsx`
**Changes**: Replace the plain `<p className="train-prompt">{promptText(...)}</p>` with an `EditableSentence` wrapping that text, `onSave` calling `updateCardText` for the field matching the *prompt* side of `direction`, then on success updating `queue` (`setQueue((q) => q.map((c) => c.id === currentCard.id ? { ...c, spanishText/englishText: newText } : c))`).

#### 2. Revealed-answer slot

**File**: `client/src/training/TrainPage.tsx`, `client/src/training/AnswerReveal.tsx`
**Changes**: `AnswerReveal` currently owns the diff rendering internally. Add an `onEditCorrectAnswer` (or similar) prop to `AnswerReveal`, or — simpler and more consistent with the prompt slot — lift the "correct answer" display out of `AnswerReveal` into `TrainPage` as a sibling `EditableSentence`, and have `AnswerReveal` accept a flag to suppress its own `correctText`/diff paragraph once an edit has happened. Concretely:
- Add local state in `TrainPage`: `const [answerOverride, setAnswerOverride] = useState<string | null>(null)`, reset to `null` whenever a new card/reveal starts (alongside the existing `setReveal(null)` resets in `handleRate`, and wherever `reveal` is newly set in `handleSubmit`).
- Pass `answerOverride` and a setter down; when set, render `EditableSentence` showing `answerOverride` (or, simplest: keep `AnswerReveal` rendering as today, but if `answerOverride !== null` render only `<EditableSentence text={answerOverride} .../>` in place of `AnswerReveal`'s `correct-answer`/`answer-diff` paragraphs, while still rendering the `verdict`/`submitted-answer` paragraphs above it unchanged.
- `onSave` for this `EditableSentence` updates the card via `updateCardText` (same field-mapping logic as the prompt slot, but for `answerText(currentCard, direction)`'s field), then sets `answerOverride` to the saved text and updates `queue` so the underlying card object also reflects the new text (important for `RatingBar`/explanation/etc. using `currentCard` after this point, and for the queue still holding it if rated `again`... actually rated cards are removed from `queue` via `slice(1)`, so this mainly matters if the user re-explains via `ExplainButton` after editing, which now correctly uses the corrected text).

This keeps `RatingBar` completely untouched — it already renders below
`AnswerReveal` based on `isCorrect`/`reveal.result.verdict`, neither of which
this phase modifies.

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`
- [x] Existing `TrainPage`/`AnswerReveal` tests still pass: `pnpm test`

#### Manual Verification:

- [ ] Before revealing, the prompt sentence has a visible edit control;
      editing and pressing Enter updates it immediately and the prompt for
      the *current* card reflects the change without a page reload.
- [ ] After revealing, both the prompt and the correct-answer sentence are
      editable.
- [ ] Editing the correct-answer sentence clears the diff highlighting and
      shows the corrected plain text; the previously-shown rating buttons
      (e.g. "Hard"/"Good"/"Easy", or "Don't remember" if it was offered)
      remain exactly as they were and are still clickable/functional.
- [ ] Rating the card after an edit still submits the review and advances
      the queue normally.
- [ ] Moving to the next card resets any edit-mode/override state (no stale
      override leaking onto the next card).

---

## Phase 5: Wire into LearnPage

### Overview

Add edit affordances to the prompt and to the answer slot (both are already
plain field renders, so no diff-related wrinkle here).

### Changes Required:

#### 1. Prompt and answer slots

**File**: `client/src/learning/LearnPage.tsx`
**Changes**: Wrap `promptText(card, direction)` (line 181) and
`answerText(card, direction)` (line 191) in `EditableSentence`, each with an
`onSave` that calls `updateCardText` for the appropriate field given
`direction`, then on success updates the in-memory session: map over
`session.queue` and `session.selected` (both hold full `Card` objects) and
replace the matching-id card's text field — e.g. extend
`client/src/learning/session.ts` with a small
`updateCardInSession(session, cardId, patch): LearningSession` helper used by
the page, keeping the "session never touches the server for FSRS" invariant
intact (this only patches the locally-held copy after the server-confirmed
text save).
- The answer slot is only rendered while `showBack` is true, but it's always
  mounted (`concealed` CSS class hides it, per the existing comment about
  not moving buttons) — confirm `EditableSentence`'s edit-mode button isn't
  reachable/focusable while concealed (likely already handled by
  `aria-hidden`/visibility, matching `ExplainButton`'s existing `concealed`
  handling).

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`
- [x] Existing `LearnPage`/`session` tests still pass: `pnpm test`

#### Manual Verification:

- [ ] Prompt sentence is editable before flipping the card.
- [ ] Answer sentence is editable after pressing Space/"Show answer".
- [ ] The edit button on the concealed answer is not visible/focusable
      before flipping.
- [ ] After editing, navigating "Still learning" (re-queues) or "Remembered"
      (advances) shows the corrected text if/when that card reappears later
      in the same session.
- [ ] Space/1/2/E shortcuts still work normally while not actively editing,
      and are not triggered while typing inside the edit input.

---

## Testing Strategy

### Unit Tests:

- `server/src/cards/service.ts`: `updateCardText` — valid input persists and
  returns the card; validation errors short-circuit before calling
  `updateCard`; not-found id returns the `notFound` branch.
- `server/src/cards/repository.ts` (integration-style, against the test DB
  if that's the existing pattern for this repo): `updateCard` updates the
  row and `updated_at`, returns `null` for a missing id, and a follow-up
  `getCard`/training-queue query for the same card shows an unchanged `due`.
- Client: `EditableSentence` — save on Enter, save on blur, cancel on
  Escape, revert + error on a rejected `onSave`, no-op on empty/unchanged
  value.

### Integration Tests:

- E2E (Playwright, per `pnpm e2e`): edit a card's prompt during Train before
  reveal; edit the correct-answer during Train after reveal, then rate it;
  edit prompt and answer during Learn. Assert the deck list (`CardsPage`)
  reflects the new text afterward, and that a due card's training-queue
  position/`due` value is unchanged by the edit (e.g. via the `/api/cards`
  `due` field before/after).

### Manual Testing Steps:

1. Start `pnpm dev`, log in, go to Train with at least one due card.
2. Edit the prompt sentence, press Enter — confirm it updates and the input
   collapses back to text.
3. Submit an answer to reveal it; edit the correct-answer sentence; confirm
   diff/highlighting disappears and the rating buttons are unchanged; rate
   the card.
4. Repeat in Learn: edit prompt before flipping, edit answer after flipping
   (Space).
5. Force a failure (e.g. briefly stop the API container) and attempt an
   edit; confirm revert + inline error, and that the rest of the
   Train/Learn flow is unaffected.
6. Check `CardsPage` deck list shows the corrected text.
7. Spot-check via `psql`/the production query script
   (`pnpm db:up` + the existing data-analysis script) that `card_schedules`,
   `reviews`, and `review_history` rows for the edited card are unchanged.

## Performance Considerations

None — single-row text updates on a small single-user dataset; no new
indexes or query patterns introduced.

## Migration Notes

No schema migration needed — `cards.spanish_text`/`english_text` already
exist and accept updates; only a new route/query, no new columns or tables.

## References

- `server/src/cards/repository.ts`, `service.ts`, `routes.ts`, `validation.ts`
- `server/src/training/repository.ts`
- `server/migrations/1718000000000_create-cards.cjs`,
  `1772000000000_create-review-history.cjs`
- `client/src/training/TrainPage.tsx`, `AnswerReveal.tsx`, `answer-check.ts`,
  `direction.ts`, `RatingBar.tsx`
- `client/src/learning/LearnPage.tsx`, `session.ts`
- `client/src/cards/DraftCardRow.tsx` (field-error styling pattern)
- `client/src/explain/ExplainButton.tsx`, `canExplain.ts` (small inline
  button pattern to model the edit button after)
- `client/src/api.ts`
