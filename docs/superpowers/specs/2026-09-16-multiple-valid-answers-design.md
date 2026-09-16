# Multiple valid answers — design

## Context

Today every card has exactly one `spanish_text` and one `english_text`
string, at every layer: the `cards` table, the `Card`/`CardInput` types, the
diff-based answer checker (`checkAnswer`), the edit-answer UI
(`EditableSentence`), the Explain/Adopt flow, card creation (UI form and the
MCP `create_card` tool), and the mistake-detection/categorization pipeline.

Many Spanish/English pairs have more than one acceptable translation (e.g.
"big" → "grande" or "grande" is the only one, but "coche"/"carro"/"auto" all
mean "car"). Today, only the single stored string is ever accepted; a
correct-but-different translation is marked wrong. This spec adds *alternate
answers* per field, checked during Training when the primary answer doesn't
match, editable alongside the primary answer in Training and Learn, and
extendable via the existing Explain → Adopt flow.

Card creation stays single-pair only (unchanged) — alternates accumulate
over time through use, not at creation time. The mistake-generated practice
flow (`PracticeMistakePage`, `editable={false}`, self-report only) is
untouched; it has no typed input and no edit affordance today, and nothing
here changes that.

## Scope boundary: Learn has no grading

Confirmed by reading `client/src/learning/LearnPage.tsx`,
`LearningSessionView.tsx`, and `client/src/cards/FlipCard.tsx`: Learn is a
tap-to-reveal, self-report flow (`Show answer` → `Remembered` / `Still
learning`) with no typed free-text input and no `checkAnswer` call anywhere.
Only Training (`client/src/training/TrainPage.tsx`) grades a typed
submission. This means:

- **Matching against alternates only happens in Training.**
- **The Explain/Adopt flow only exists in Training** (`FlipCard`'s Learn
  usage already renders `ExplanationModal` without the answer-check props,
  so no Adopt button appears in Learn today, and that doesn't change).
- **The multi-answer edit UI applies to both Training and Learn** — editing
  a field's primary/alternates is about curating the card's data, not about
  grading, so it's available wherever `EditableSentence` is today.
- **Learn's reveal additionally displays all alternates** (new — see
  "Client — Learn" below), read-only, so the user can see every accepted
  answer while self-judging recall.

## Data model

New table `card_alternate_answers`:

```sql
CREATE TABLE card_alternate_answers (
  id         serial PRIMARY KEY,
  card_id    integer NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  field      varchar(10) NOT NULL CHECK (field IN ('spanish', 'english')),
  text       varchar(70) NOT NULL CHECK (btrim(text) <> ''),
  position   integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX card_alternate_answers_card_id_field_idx
  ON card_alternate_answers (card_id, field, position);
```

- `text` reuses the same length/non-blank constraint style as
  `cards.spanish_text`/`english_text`.
- `position` is 0-based, unique per `(card_id, field)`, assigned as
  `max(position) + 1` on insert (no gap-filling needed — display order is
  the only thing that reads it, not arithmetic).
- Max 5 rows per `(card_id, field)`, enforced in the service layer (not a DB
  constraint) — returns 400 from the create endpoint once at cap.
- No `updated_at`: an edit is a plain `UPDATE text` on the existing row; a
  delete removes the row; positions of other rows are never renumbered.

`Card` (`server/src/cards/repository.ts`) gains two read-only fields:

```ts
export interface Card {
  // ...existing fields unchanged...
  spanishAlternates: string[];
  englishAlternates: string[];
}
```

Populated by a `LEFT JOIN`/subquery ordered by `position` wherever cards are
fetched for Training/Learn (`GET /api/cards`, and any other card-list read
path used by those two flows). `CardInput` (creation/update) is **unchanged**
— alternates are managed through their own endpoints, never through
`POST /api/cards/batch` or `PATCH /api/cards/:id`.

## API

New routes under `server/src/cards/` (or a small new `alternates`
sub-module reusing the existing `cards` auth/router wiring):

- `POST /api/cards/:id/alternates`
  Body: `{ field: 'spanish' | 'english', text: string }`.
  400 if: `text` blank, `text` exceeds 70 chars, already 5 alternates for
  that `(card, field)`, or `text` normalizes (via the same
  `normalizeAnswer` used by the answer checker) to the same value as the
  primary text or an existing alternate for that field. On success, inserts
  at the next position and returns the created alternate
  (`{ id, field, text, position }`).

- `PATCH /api/cards/:id/alternates/:altId`
  Body: `{ text: string }`. Same validation as create (blank/length/
  duplicate-after-normalization against primary + other alternates for that
  field, excluding itself). Updates `text` in place.

- `DELETE /api/cards/:id/alternates/:altId`
  Deletes the row. No cascading effects (nothing else references an
  alternate's id).

All three follow the existing `cards/routes.ts` auth pattern
(`requireAuth`), and 404 if `id`/`altId` doesn't belong to the caller's card.

## Matching logic (Training only)

`client/src/training/answer-check.ts` gains a new function alongside the
existing `checkAnswer`:

```ts
interface AlternateAwareResult extends AnswerCheckResult {
  matchedText: string; // the text the returned verdict/diff is against
}

function checkAnswerWithAlternates(
  submitted: string,
  primary: string,
  alternates: string[],
): AlternateAwareResult
```

Algorithm:

1. Run `checkAnswer(submitted, primary)`. If the verdict is `correct` or
   `correctWithDifferences`, return it as-is with `matchedText: primary`.
   **Alternates are never consulted when primary already passes** — the
   primary answer always takes precedence per the original requirement.
2. If primary's verdict is `incorrect`, walk `alternates` in stored order
   (`position` ascending). For the first alternate where
   `checkAnswer(submitted, alt)` is not `incorrect`, return that result with
   `matchedText: alt`.
3. If no alternate matches either, return the primary's `incorrect` result
   unchanged, with `matchedText: primary` (today's behavior, unchanged).

`TrainPage.handleSubmit` (`client/src/training/TrainPage.tsx`) switches from
calling `checkAnswer(submitted, answerText(card, direction))` to calling
`checkAnswerWithAlternates(submitted, answerText(card, direction),
answerAlternates(card, direction))`, where `answerAlternates` is a small
helper mirroring `answerText`/`promptText` in
`client/src/training/direction.ts`, picking `spanishAlternates` or
`englishAlternates` based on which field is playing the answer role for the
current direction.

The diff/correction UI (`AnswerReveal`) renders against `matchedText`
instead of always against the primary — so when an alternate matched, the
user sees their submission diffed against *that* alternate, not against a
primary they didn't actually match. When an alternate matched with
`correctWithDifferences`, a small label ("matched an alternate answer") is
shown so the user understands why the diff isn't against the primary text
they may be used to seeing — exact copy/placement is an implementation
detail for `AnswerReveal`, not a hard requirement here.

Server-side `validation.ts`'s three-state `VERDICTS` enum and
`detectedCorrect` derivation are unchanged — the server still trusts
whatever verdict the client computed and sends; it doesn't re-run any
matching itself today, and this doesn't change that.

## Mistake pipeline integration

`review_history.correct_text` (existing column) is set from
`matchedText` — the text that `checkAnswerWithAlternates` actually diffed
against — instead of always the primary:

- Submission matched primary → `correct_text` = primary (unchanged).
- Submission matched an alternate → `correct_text` = that alternate's text.
- Submission matched nothing (`incorrect`) → `correct_text` = primary
  (unchanged, since there's no single "closest" alternate to prefer — this
  keeps today's behavior for true failures).

Because the *verdict* sent to `review_history` is also the alternate-aware
one, a submission that matched an alternate is stored as `correct`/
`correctWithDifferences` exactly like a primary match would be. The
categorization scheduler's existing filter
(`verdict IN ('incorrect', 'correctWithDifferences')`,
`server/src/categorization/repository.ts`) is unchanged and needs no code
changes — it already excludes true `correct` rows regardless of which text
produced them, and already processes `correctWithDifferences` rows using
whatever `correct_text` is on the row. `practice/generator.ts` and the
categorization LLM prompt are unchanged; they keep reading `correct_text`
as-is, sometimes now an alternate's text instead of primary's.

## Edit UI (Training and Learn)

New component `EditableAnswerGroup` (`client/src/cards/`), used wherever a
card's field is currently rendered as the graded/revealed **answer** side:
`AnswerReveal.tsx` (Training) and `FlipCard.tsx`'s revealed-answer rendering
(Learn). The **prompt** side (not yet revealed / not being tested this
direction) keeps using the plain `EditableSentence` it uses today —
alternates are only relevant to the field currently playing the answer
role, and since alternates are per-field (not per-direction), the same
field gets the full multi-answer editor when it's the answer and the simple
single-box editor when it's the prompt, depending on the session's current
direction.

Layout (mirrors the pencil-icon toggle pattern `EditableSentence` already
uses):

```
Primary answer
[ ...existing EditableSentence, autosave on blur/Enter... ]

Alternative answers
[ text input ]                                    [x]
[ text input ]                                    [x]
[ + Add alternative ]   (hidden once 5 alternates exist)
```

- Each alternate row behaves like a self-contained mini editor: inline
  autosave on blur/Enter (`PATCH .../alternates/:altId`), `[x]` calls
  `DELETE .../alternates/:altId` immediately (no confirmation dialog — low
  cost, single-user app, consistent with how card edits already autosave
  without confirmation).
- `+ Add alternative` adds a new empty, focused input row; nothing is
  persisted until the user types something and blurs/Enters (`POST
  .../alternates`), mirroring `EditableSentence`'s existing "revert on
  empty" behavior rather than inserting blank rows.
- Validation errors from the API (duplicate-after-normalization, cap
  reached) surface as a small inline message under the offending row,
  reusing whatever inline-error pattern `EditableSentence` already has for
  its own save failures.

## Client — Learn reveal shows all alternates

`FlipCard.tsx`'s answer-reveal rendering (post "Show answer") changes from
showing only the primary answer text to showing primary + all of that
field's alternates, vertically listed, **read-only** (no inputs — editing
still only happens via the existing pencil-icon toggle into
`EditableAnswerGroup`, a separate interaction from viewing). This is
display-only: Learn still has no grading, so there's no "matched" state to
highlight — all answers are shown as equally valid, primary visually first.

## Explain / Adopt flow

`ExplanationModal`'s Adopt button
(`client/src/training/TrainPage.tsx`, `onAdoptAnswer`) changes from setting
`answerEditRequest` (which today pre-fills the primary field's edit box,
replacing it once committed) to instead calling
`POST /api/cards/:id/alternates` directly with the suggested text, for
whichever field is currently playing the answer role.

Before posting, the client normalizes the suggested text (same
`normalizeAnswer` used elsewhere) and compares it against the primary and
existing alternates for that field:

- If it's a duplicate of any of them, no-op — close the modal, optionally
  show a brief "already saved as an answer" toast. No API call, no error
  state (this isn't a failure, just nothing to do).
- Otherwise, `POST` the new alternate, then patch the in-session card
  (`updateCardInSession` equivalent already used elsewhere in `TrainPage`)
  so the new alternate is immediately available for matching later in the
  same session, without needing a full card refetch.

The primary answer is **never modified** by Adopt under this design — it
only ever grows the alternates list. This is the one behavior change from
today (Adopt currently overwrites the primary).

## Card creation — unchanged

Both the UI (`client/src/cards/DraftCardRow.tsx`) and the MCP `create_card`
tool (`server/src/mcp/tools.ts`) continue to accept exactly one
`spanish_text` + one `english_text` per card, no alternates field. This was
an explicit constraint from the original request — alternates accumulate
through use (edits and Adopt), not at creation time.

## Testing

- Server: repository/route tests for `card_alternate_answers` create/
  update/delete — cap enforcement (6th insert 400s), duplicate-after-
  normalization rejection on create and update, cascading delete when a
  card is deleted, ordering by `position` on read.
- Server: `checkAnswerWithAlternates` unit tests (this logic can live
  client-side but should be tested in isolation regardless of which
  package it ends up in) — primary match short-circuits before alternates
  are checked; first-alternate-in-order wins when primary fails and
  multiple alternates would match; true failure when nothing matches;
  `matchedText` is correct in all three cases.
- Server: `review_history.correct_text`/verdict written from the
  alternate-aware result in the Training submission route — a match
  against an alternate is stored as `correct`/`correctWithDifferences` (not
  `incorrect`), with `correct_text` set to the alternate's text.
- Client: `EditableAnswerGroup` component tests — add (empty row → typed →
  saved), edit an existing alternate, delete, cap reached hides `+`,
  inline error on duplicate.
- Client: `FlipCard` Learn-reveal test — primary + all alternates render
  read-only after "Show answer", in stored order, primary first.
- Client: `ExplanationModal`/`TrainPage` Adopt test — suggested text is
  posted as a new alternate (not a primary overwrite); duplicate suggested
  text is a no-op with no API call.

## Out of scope (this MVP)

- Card creation with alternates at creation time (still single-pair only).
- The mistake-generated practice flow (`PracticeMistakePage`) — no typed
  input, no edit affordance, untouched by this spec.
- Promoting an alternate to primary, or reordering alternates beyond
  insertion order.
- Per-direction alternates (alternates are per-field, confirmed) — a
  direction concept doesn't exist in card storage today and this spec
  doesn't introduce one.
- "Best match" ranking among multiple matching alternates — first match in
  stored order wins, by design.
- Any change to `practice/generator.ts` or the categorization LLM prompt.
