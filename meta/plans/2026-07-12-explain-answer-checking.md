---
type: plan
id: "2026-07-12-explain-answer-checking"
title: "Explain-Driven Answer Checking Implementation Plan"
date: "2026-07-12T17:16:07+00:00"
author: "Anthony Scatchell"
producer: create-plan
status: draft
tags: [llm, explanations, training, answer-check]
revision: "d44db2baca912e9ecfe99e0ca56a87eccb62bfd8"
repository: "spanish-cards"
last_updated: "2026-07-12T17:16:07+00:00"
last_updated_by: "Anthony Scatchell"
schema_version: 1
---

# Explain-Driven Answer Checking Implementation Plan

## Overview

Extend the existing "Explain" modal so that, after a typed Train answer is marked
`incorrect` by the deterministic checker, the user can request an **"Explain more"**
LLM check of *their actual submitted answer*. A single combined call returns (a) a
markdown critique of what's specifically wrong with what they typed, and (b) a strict
`valid | invalid` verdict on whether their wording is in fact an equal-or-better
translation than the card's stored answer. When the verdict is `valid`, the modal
offers a one-click **Adopt** that pre-fills the suggested wording into the existing
inline `EditableSentence` edit control (requiring the normal Enter/blur to save). The
result is cached in Postgres, keyed by the card's answer text pair + direction +
normalized submitted answer, and is fully user-triggered.

Idea document: `meta/ideas/explain-answer-checking.md`.

## Current State Analysis

The three features this builds on are all shipped and match the idea's assumptions:

- **Explanation vertical slice** exists end to end: cache table + repository
  (`server/src/explanations/repository.ts`), cache-or-generate service
  (`server/src/explanations/service.ts`), two OpenAI generators in one boundary file
  (`server/src/explanations/llm.ts` — `createExplanationGenerator`,
  `createFollowUpGenerator`), routes with injectable deps
  (`server/src/explanations/routes.ts`, `explanationRoutes(pool, generator, followUp,
  overrides?)`), client `fetchExplanation`/`askFollowUp` (`client/src/api.ts:146-170`),
  and the modal (`client/src/explain/ExplanationModal.tsx`).
- **The modal is opened from two places**: `TrainPage` (typed-answer flow,
  `TrainPage.tsx:290-297`) and `FlipCard` (Learn + Train-retry,
  `FlipCard.tsx:117-124`). Only the Train typed-answer flow has a checker verdict and a
  submitted answer; `FlipCard` has neither. This makes "Explain more" **naturally
  Train-typed-answer-only** — it gates off wherever the new props are absent.
- **The verdict and submitted text already live in `TrainPage`** as
  `reveal.result.verdict` and `reveal.submitted` (`TrainPage.tsx:31-34,108,114`) but are
  **not currently passed to `ExplanationModal`** — this is the core new plumbing.
- **Deterministic checker** (`client/src/training/answer-check.ts`) exports
  `checkAnswer` and `normalizeAnswer` (lowercased, diacritics stripped, punctuation
  removed, whitespace collapsed). This normalization lives **client-side only**; the
  server has no copy.
- **Inline edit** is a shared `EditableSentence`
  (`client/src/cards/EditableSentence.tsx`): a pencil toggles a single-line input that
  saves on Enter/blur (`onSave`), reverts on failure, and stops keydown propagation. It
  is **fully self-contained** — its edit state is internal and its value derives from
  `text`. It cannot currently be driven into edit mode programmatically with a
  different pre-filled value; that is the one change it needs.
- **Adopt already has a save path**: `TrainPage.saveCardField`
  (`TrainPage.tsx:148-158`) PATCHes one field via `updateCardText` and patches the
  session with `patchCard`; `AnswerReveal`'s answer slot is an `EditableSentence` whose
  `onSaveAnswer` also sets `answerOverride` to suppress the diff
  (`TrainPage.tsx:275-279`, `AnswerReveal.tsx:50-60`).
- **Config** already carries `openaiSecretKey` / `openaiBaseUrl`
  (`server/src/config.ts:18-19,34-35`); no new env vars. The e2e stack already injects
  `OPENAI_SECRET_KEY`/`OPENAI_BASE_URL` and runs an OpenAI stub
  (`e2e/openai-stub.ts`) branching `POST /responses` on markers in `input`, with a
  request counter for cache assertions.

### Key Discoveries

- **Cache keying (supersedes the idea doc, with sign-off):** the idea says key by
  *card id* + normalized submitted answer. An answer-check result depends only on the
  **language content** (correct answer + submitted text), not the card row, so we key by
  the **answer text pair + direction + normalized submitted** — exactly like the
  `explanations` cache. This dedupes across identical cards, survives the
  delete-and-recreate workflow, and avoids the stored-answer-edit staleness the idea had
  to accept under card-id keying.
- **LLM output contract:** a single call returns a JSON object
  `{ verdict: 'valid' | 'invalid', suggestedAnswer: string | null, critiqueMarkdown:
  string }` in `output_text`, parsed and validated defensively in the boundary (chosen
  over strict `json_schema` for simplicity and stub triviality).
- **"Explain more" is only meaningful for `incorrect`**: `correct` /
  `correctWithDifferences` are cosmetic by construction (per the idea's non-goals).
- **Route signature grows one positional generator** (`answerCheck`), shifting
  `overrides?` by one; the existing `routes.test.ts` helper indexes generators/overrides
  positionally and must be updated in lockstep.

## Desired End State

- After checking a Train answer that comes back `incorrect` on an `en<->es` card, the
  modal shows an **"Explain more"** action (button, and re-pressing `E` while the modal
  is open). It is absent for `correct`/`correctWithDifferences`, for non-`en<->es`
  cards, and everywhere the modal is opened without a typed submission (Learn / retry).
- Clicking it runs one combined LLM call (cache-first). It renders the markdown critique
  and, when the verdict is `valid`, a distinct "this is a valid/better translation"
  framing plus an **Adopt** action that closes the modal and drops the suggested wording
  into the card's inline answer edit field in edit mode (explicit Enter/blur to save,
  routed through the existing edit path). When `invalid`, no adopt action.
- Repeat requests for the same answer pair + direction + normalized submission are served
  from Postgres with no model call. The base explanation and the answer-check load and
  cache independently; an answer-check failure shows a recoverable inline error while the
  base explanation stays fully usable.
- No change to `checkAnswer`, FSRS, self-rating, or the "correct rate" stat.
- `pnpm test`, `pnpm typecheck`, and `pnpm e2e` pass with zero real LLM calls.

**Verification:** in `/train`, type a wrong-but-valid alternate on an `en<->es` card →
"Explain more" → `valid` verdict → Adopt → confirm the inline edit saves the new wording
(and `CardsPage` reflects it, schedule untouched). Type a genuinely wrong answer →
critique shown, no adopt. Reopen with the same wrong answer → served from cache (stub
count unchanged). Break the answer-check call → inline error, base explanation intact.

## What We're NOT Doing

- Not changing `checkAnswer`, FSRS scheduling, self-rating options, or the "correct
  rate" stat (a separate idea: `meta/ideas/rating-based-correct-stat.md`).
- Not adding a multiple-accepted-answers data model — Adopt overwrites the single stored
  answer via the existing edit path (no history, no alternates).
- Not running the check automatically/silently, nor on `correct` /
  `correctWithDifferences` verdicts, nor from Learn / Train-retry (`FlipCard`).
- Not invalidating the base-explanation cache or the answer-check cache on card edits
  (text-pair keying makes edited answers regenerate naturally).
- Not adding a confirmation dialog for Adopt — the pre-filled inline edit's Enter/blur is
  the friction.
- Not touching the follow-up Q&A behavior (it keeps working and keeps access to the
  loaded explanation markdown).
- Not adding diff-style inline annotation of the mistake (freeform prose for v1; deferred
  in the idea's Future Considerations).
- No languages beyond `en<->es`.

## Implementation Approach

Mirror the shipped explanation slice as a second cache-first vertical: new cache table +
repository (Phase 1), new generator + service + endpoint wired into the existing router
(Phase 2), client API + the modal's "Explain more" section (Phase 3), the Adopt wiring
that teaches `EditableSentence` to start editing programmatically and threads it through
`TrainPage`/`AnswerReveal` (Phase 4), and the e2e stub branch + specs + docs (Phase 5).
Backend before frontend; each phase independently verifiable.

---

## Phase 1: Server — answer-check cache table + repository

### Overview

A Postgres cache for combined answer-check results, keyed by answer text pair +
direction + normalized submitted answer, plus a server-side normalization mirroring the
client checker.

### Changes Required

#### 1. Migration

**File**: `server/migrations/1773000000000_create-answer-checks.cjs` (new)

```js
/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('answer_checks', {
    id: 'id',
    spanish_text: { type: 'varchar(70)', notNull: true },
    english_text: { type: 'varchar(70)', notNull: true },
    // Which language was the prompt: 'spanish-to-english' | 'english-to-spanish'.
    direction: { type: 'varchar(20)', notNull: true },
    // Normalized (lowercased, de-accented, punctuation-stripped) submitted answer.
    submitted_normalized: { type: 'text', notNull: true },
    verdict: { type: 'varchar(10)', notNull: true }, // 'valid' | 'invalid'
    suggested_answer: { type: 'varchar(70)' }, // null unless verdict = 'valid'
    critique_markdown: { type: 'text', notNull: true },
    model: { type: 'varchar(50)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('answer_checks', 'answer_checks_key_unique', {
    unique: ['spanish_text', 'english_text', 'direction', 'submitted_normalized'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('answer_checks');
};
```

Deliberately **no FK to `cards`** (like `explanations`): keyed by text content, it
dedupes across identical cards and survives card delete/recreate.

#### 2. Server-side normalization

**File**: `server/src/explanations/normalize.ts` (new)

`normalizeSubmitted(text: string): string` — mirror the client's `normalizeAnswer`
(`client/src/training/answer-check.ts:47-58`): split on whitespace, for each word
`NFD`-normalize + strip combining marks + lowercase, keep only `\p{L}\p{N}` chars, drop
empties, join with single spaces. Kept intentionally simple and documented as mirroring
the client checker; exact parity isn't required (it only affects cache dedup rate).

#### 3. Repository

**File**: `server/src/explanations/answer-check-repository.ts` (new)

- Domain types `AnswerCheck` (`{ id, spanishText, englishText, direction,
  submittedNormalized, verdict, suggestedAnswer, critiqueMarkdown, model, createdAt }`)
  and `NewAnswerCheck` (no `id`/`createdAt`), with a snake→camel `toAnswerCheck` mapper.
- `findAnswerCheck(db, key)` where `key = { spanishText, englishText, direction,
  submittedNormalized }` — SELECT by the unique tuple, returns `AnswerCheck | null`.
- `insertAnswerCheck(db, input: NewAnswerCheck)` — `INSERT ... ON CONFLICT
  (spanish_text, english_text, direction, submitted_normalized) DO NOTHING RETURNING
  ...`, falling back to `findAnswerCheck` on conflict (first writer wins), exactly like
  `insertExplanation` (`repository.ts:53-73`).

### Success Criteria

#### Automated Verification

- [x] Migration applies and reverses cleanly: `pnpm migrate:up`, `pnpm migrate:down`,
      `pnpm migrate:up`
- [x] Type checking passes: `pnpm typecheck`
- [x] Unit tests pass: `pnpm test`

#### Manual Verification

- [ ] `\d answer_checks` in the dev DB shows the table and unique constraint.

---

## Phase 2: Server — answer-check generator, service, endpoint

### Overview

A third OpenAI generator in the existing boundary that returns a validated JSON verdict,
a cache-first service, and a new authenticated route wired into `explanationRoutes`.

### Changes Required

#### 1. Generator

**File**: `server/src/explanations/llm.ts`

Add alongside the existing generators (reusing the same client construction):

```ts
export interface AnswerCheckOutput {
  verdict: 'valid' | 'invalid';
  suggestedAnswer: string | null;
  critiqueMarkdown: string;
}

export type AnswerCheckGenerator = (input: {
  promptText: string; // the side shown to the learner
  expectedAnswer: string; // the card's stored answer for this direction
  submittedAnswer: string; // raw text the learner typed (may be empty)
}) => Promise<AnswerCheckOutput>;

const ANSWER_CHECK_INSTRUCTIONS = [
  'You are a strict, conservative Spanish/English translation examiner for one flashcard.',
  'You are given the prompt the learner saw, the expected answer stored on the card, and',
  'the answer the learner actually submitted.',
  'Do TWO things and return ONLY a JSON object (no prose, no markdown fences):',
  '1. Judge, strictly, whether the submitted answer is an equal-or-better translation of',
  '   the prompt than the expected answer. Favor the most natural, native phrasing; do',
  '   NOT be lenient or eager to validate the learner. A different-but-equally-correct',
  '   rendering counts as "valid"; anything with a real error (wrong tense, gender/number',
  '   agreement, wrong preposition, wrong word, missing/added meaning, nonsense/empty)',
  '   counts as "invalid".',
  '2. Write a brief GitHub-flavored-markdown critique in English: when invalid, name the',
  '   specific error(s) concretely; when valid, briefly say why it is an acceptable or',
  '   better alternative. A few short bullets, no headings, no preamble.',
  'JSON shape: {"verdict":"valid"|"invalid","suggestedAnswer":<string|null>,',
  '"critiqueMarkdown":<string>}. Set suggestedAnswer to the exact wording to store on the',
  'card ONLY when verdict is "valid" (otherwise null). Keep suggestedAnswer a single line,',
  'at most 70 characters.',
].join(' ');

export function createAnswerCheckGenerator(config: AppConfig): AnswerCheckGenerator | null {
  if (!config.openaiSecretKey) return null;
  const client = new OpenAI({
    apiKey: config.openaiSecretKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    timeout: 20_000,
    maxRetries: 1,
  });
  return async ({ promptText, expectedAnswer, submittedAnswer }) => {
    const response = await client.responses.create({
      model: EXPLANATION_MODEL,
      instructions: ANSWER_CHECK_INSTRUCTIONS,
      input: [
        `Prompt shown to the learner: ${promptText}`,
        `Expected answer on the card: ${expectedAnswer}`,
        `Learner's submitted answer: ${submittedAnswer}`,
      ].join('\n'),
      max_output_tokens: 500,
      reasoning: { effort: 'none' },
    });
    return parseAnswerCheck(response.output_text);
  };
}
```

Add a `parseAnswerCheck(raw: string | undefined): AnswerCheckOutput` helper (module-local)
that `JSON.parse`es, validates `verdict` is one of the two literals, coerces
`suggestedAnswer` to a trimmed non-empty ≤70-char string or `null` (and forces `null`
whenever `verdict !== 'valid'`), and requires a non-empty `critiqueMarkdown` — throwing
on any violation so the route maps it to a retryable 502. The marker
`Learner's submitted answer:` in the input is what the e2e stub branches on (Phase 5).

#### 2. Service

**File**: `server/src/explanations/answer-check-service.ts` (new)

```ts
export interface AnswerCheckDeps {
  findAnswerCheck: (key: AnswerCheckKey) => Promise<AnswerCheck | null>;
  insertAnswerCheck: (input: NewAnswerCheck) => Promise<AnswerCheck>;
  generate: AnswerCheckGenerator | null;
}

export type AnswerCheckResult =
  | { status: 'ok'; answerCheck: AnswerCheck; source: 'cached' | 'generated' }
  | { status: 'unavailable' };

export async function getOrCreateAnswerCheck(
  deps: AnswerCheckDeps,
  input: {
    spanishText: string;
    englishText: string;
    direction: Direction; // 'spanish-to-english' | 'english-to-spanish'
    submittedAnswer: string;
  },
): Promise<AnswerCheckResult>;
```

Logic mirrors `getOrCreateExplanation`: compute `submittedNormalized =
normalizeSubmitted(submittedAnswer)`; derive `promptText`/`expectedAnswer` from
`direction` (`spanish-to-english` → prompt = spanish, expected = english; else swapped);
`findAnswerCheck` by `{ spanishText, englishText, direction, submittedNormalized }` →
`cached`; no generator → `unavailable`; else `generate`, `insertAnswerCheck` (persisting
verdict/suggestedAnswer/critiqueMarkdown/model + the key columns), return `generated`.
Errors from `generate` propagate to the route.

#### 3. Endpoint

**File**: `server/src/explanations/routes.ts`

- Extend `ExplanationRouteDeps` with `findAnswerCheck`, `insertAnswerCheck`, and
  `answerCheck?: AnswerCheckGenerator | null`.
- Add `answerCheck: AnswerCheckGenerator | null` as a **new 4th positional param**
  (`explanationRoutes(pool, generator, followUp, answerCheck, overrides?)`); default the
  new deps from the pool like the others.
- Add `POST /:id/explanation/answer-check`:
  - id non-integer/≤0 → 400 (reuse existing guard).
  - Body `{ submittedAnswer, direction }`: `submittedAnswer` must be a string (empty
    allowed — the idea wants junk/empty to still run) capped at e.g. `MAX_SUBMITTED_CHARS
    = 500` → 400 on non-string/oversized; `direction` must be one of the two literals →
    400 otherwise.
  - Load card → 404 if missing; `languagePair !== 'en<->es'` → 400 (same messages).
  - `answerCheck` generator `null` → 502 `{ error: 'Answer check is not configured' }`.
  - Call `getOrCreateAnswerCheck`; catch generator/parse throw → 502 `{ error: 'Answer
    check failed' }` (log the underlying error, never expose it).
  - 200 → `{ answerCheck: { verdict, suggestedAnswer, critiqueMarkdown, createdAt },
    source: 'cached' | 'generated' }`.

  POST because a miss writes a row; the client maps any failure to a friendly inline
  error, so status nuance is for logs/tests.

#### 4. Wire in app.ts

**File**: `server/src/app.ts:47-51`

```ts
import {
  createAnswerCheckGenerator,
  createExplanationGenerator,
  createFollowUpGenerator,
} from './explanations/llm.js';
// ...
app.use(
  '/api/cards',
  requireAuth(config),
  explanationRoutes(
    pool,
    createExplanationGenerator(config),
    createFollowUpGenerator(config),
    createAnswerCheckGenerator(config),
  ),
);
```

#### 5. Unit tests

**File**: `server/tests/explanations/answer-check-service.test.ts` (new) — cached key →
`cached`, generator not called (spy); miss → generate+insert → `generated`; `generate:
null` → `unavailable`; generator rejection propagates; direction correctly selects
prompt/expected passed to the generator.

**File**: `server/tests/explanations/routes.test.ts` (extend) — new `describe` for
`POST /:id/explanation/answer-check`: 400 (bad id, bad/missing direction, non-string or
oversized submitted), 404 (missing card), 400 (wrong language pair), 502 (generator null,
generator throw), 200 shape for both `valid` (with `suggestedAnswer`) and `invalid`
(null), and `cached` vs `generated` source. **Update the `startServer` helper**: the new
`answerCheck` positional generator shifts `overrides` from `Parameters[3]` to
`Parameters[4]`, and lets tests inject `findAnswerCheck`/`insertAnswerCheck`.

### Success Criteria

#### Automated Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (new service + extended route tests, existing explanation/
      follow-up tests still green after the signature change)

#### Manual Verification

- [ ] Dev servers running, real key: `curl -X POST
      localhost:4102/api/cards/<id>/explanation/answer-check` with
      `{"submittedAnswer":"...","direction":"english-to-spanish"}` returns a sensible
      `valid`/`invalid` JSON with `source:"generated"`; a repeat returns
      `source:"cached"` with no new model call.
- [ ] With `OPENAI_SECRET_KEY` unset, the endpoint returns the 502 not-configured error.

---

## Phase 3: Client — API function + modal "Explain more" section

### Overview

A typed client call and the modal's second LLM-backed action: a trigger visible only for
`incorrect` typed submissions, its own load/cache/error lifecycle independent of the base
explanation, verdict-aware rendering, an Adopt affordance, and the `E`-again shortcut.

### Changes Required

#### 1. API client

**File**: `client/src/api.ts` (after `askFollowUp`)

```ts
export interface AnswerCheckResponse {
  answerCheck: {
    verdict: 'valid' | 'invalid';
    suggestedAnswer: string | null;
    critiqueMarkdown: string;
    createdAt: string;
  };
  source: 'cached' | 'generated';
}

export function checkSubmittedAnswer(
  cardId: number,
  submittedAnswer: string,
  direction: 'spanish-to-english' | 'english-to-spanish',
  signal?: AbortSignal,
): Promise<AnswerCheckResponse> {
  return request(`/api/cards/${cardId}/explanation/answer-check`, {
    method: 'POST',
    body: JSON.stringify({ submittedAnswer, direction }),
    signal,
  });
}
```

#### 2. Modal

**File**: `client/src/explain/ExplanationModal.tsx`

Add optional props (present only from the Train typed-answer flow):

```ts
interface Props {
  cardId: number;
  spanishText: string;
  englishText: string;
  onClose: () => void;
  // Present only when opened after a typed Train check:
  submittedAnswer?: string;
  direction?: 'spanish-to-english' | 'english-to-spanish';
  verdict?: Verdict;
  // Adopts the suggested wording (closes the modal + pre-fills the inline edit):
  onAdoptAnswer?: (suggested: string) => void;
}
```

- `const canExplainMore = verdict === 'incorrect' && submittedAnswer !== undefined &&
  onAdoptAnswer !== undefined && direction !== undefined;` (When the modal is opened
  from `FlipCard`, these are all undefined → the whole section is absent.)
- New state: `answerCheckState: 'idle' | 'loading' | 'ready' | 'error'`, `answerCheck:
  AnswerCheckResponse['answerCheck'] | null`, and an `AbortController` ref (mirror the
  follow-up lifecycle at `ExplanationModal.tsx:23,39-43,61-63`).
- `runAnswerCheck()` (guarded by `canExplainMore` and only when `idle`/`error`): set
  `loading`, `checkSubmittedAnswer(cardId, submittedAnswer!, direction!, signal)` → on
  success store result + `ready`; on non-abort error → `error`. Aborted on unmount.
  Server-side cache makes a reopened-modal repeat return instantly with no model call.
- Rendering, only when `canExplainMore`, appended inside `.explanation-modal-body` (the
  base explanation and follow-up sections are unchanged and stay usable even while this
  loads):
  - `idle`: an **"Explain more"** button (`aria-label="Explain more"`, `(E)` hint).
  - `loading`: a subtle "Checking your answer…" hint.
  - `error`: `role="alert"` "Sorry! Couldn't check that answer — try again." plus a
    Retry button re-calling `runAnswerCheck()`.
  - `ready`: render `answerCheck.critiqueMarkdown` via `<ReactMarkdown>`. When
    `answerCheck.verdict === 'valid' && answerCheck.suggestedAnswer`, show a distinct
    "Your answer works — here's a cleaner version to store:" block with the
    `suggestedAnswer` and an **Adopt** button calling `onAdoptAnswer(suggestedAnswer)`.
    When `invalid`, render only the critique (no adopt).
- **Keyboard:** extend the modal's existing capture-phase keydown
  (`ExplanationModal.tsx:45-54`) so a bare `E`/`KeyE` (no modifier, target not an
  input/textarea) triggers `runAnswerCheck()` when `canExplainMore` and state is
  `idle`/`error` — the idea's "press the Explain shortcut again while open". `Escape`
  still closes.

#### 3. Styles

**File**: `client/src/styles.css` — a `.answer-check` section wrapper, `.answer-check
button` (reuse `.explain-button` weight), an `.answer-check-adopt` block visually
distinct from the invalid critique, and the loading/error hint spacing. Ensure the modal
body still scrolls (base explanation + follow-up + answer-check can be tall on mobile).

### Success Criteria

#### Automated Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes

#### Manual Verification

- [ ] Covered by Phase 5 e2e; interactive smoke in Phase 5 manual steps.

---

## Phase 4: Client — Adopt wiring (programmatic edit + TrainPage plumbing)

### Overview

Teach `EditableSentence` to start editing programmatically with a pre-filled value, and
thread the submitted answer / direction / verdict / adopt callback from `TrainPage`
through `AnswerReveal` into the answer slot.

### Changes Required

#### 1. Programmatic edit on EditableSentence

**File**: `client/src/cards/EditableSentence.tsx`

Add one optional prop and an effect; leave all existing save/cancel/blur/revert logic
untouched:

```ts
// When this changes to a new token, enter edit mode pre-filled with `value`.
editRequest?: { value: string; token: number };
```

```ts
useEffect(() => {
  if (!editRequest) return;
  setValue(editRequest.value);
  setError(null);
  setEditing(true);
}, [editRequest?.token]);
```

The existing `if (!editing) setValue(text)` sync effect won't clobber it (we set
`editing = true`). The input's `autoFocus` fires because it mounts when `editing` flips
true. Committing runs the normal `onSave`; Escape reverts to `text` as today.

#### 2. Thread through AnswerReveal

**File**: `client/src/training/AnswerReveal.tsx` — add optional `answerEditRequest?:
{ value: string; token: number }` and pass it to the answer `EditableSentence`
(`AnswerReveal.tsx:50-57`) as `editRequest`.

#### 3. TrainPage

**File**: `client/src/training/TrainPage.tsx`

- Add `const [answerEditRequest, setAnswerEditRequest] = useState<{ value: string; token:
  number } | undefined>();` Reset to `undefined` wherever `answerOverride` resets
  (`handleSubmit`'s `setAnswerOverride(null)` at `:107`, and `handleRate`'s reset at
  `:131`).
- Pass the new props to the modal (`:290-297`):

```tsx
<ExplanationModal
  cardId={card.id}
  spanishText={card.spanishText}
  englishText={card.englishText}
  submittedAnswer={reveal.submitted}
  direction={direction}
  verdict={reveal.result.verdict}
  onAdoptAnswer={(suggested) => {
    setAnswerEditRequest({ value: suggested, token: Date.now() });
    setExplainOpen(false);
  }}
  onClose={() => setExplainOpen(false)}
/>
```

- Pass `answerEditRequest={answerEditRequest}` into `<AnswerReveal>` (`:270-280`).

When the user confirms the pre-filled edit, the existing `onSaveAnswer`
(`saveCardField(answerField, …).then(() => setAnswerOverride(newText))`) persists it and
suppresses the diff — no new save path. `FlipCard` is untouched, so Learn / Train-retry
never expose Explain more.

### Success Criteria

#### Automated Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (existing `EditableSentence`/`TrainPage`/`AnswerReveal` tests
      still green)

#### Manual Verification

- [ ] Covered by Phase 5 e2e; interactive smoke in Phase 5 manual steps.

---

## Phase 5: E2E stub branch, specs, docs

### Overview

Make the OpenAI stub answer answer-check calls with JSON verdicts (valid/invalid/failure
sentinels), add Playwright coverage for the full flow, and sync docs.

### Changes Required

#### 1. Stub

**File**: `e2e/openai-stub.ts`

In the `/responses` handler, branch on `input` (order matters — check failure first):

- `input` contains `TRIGGER-CHECK-FAILURE` → 500 (fails only the answer-check call; the
  sentinel lives in the submitted answer, never in the base-explanation input, so the
  base explanation still succeeds).
- else `input` contains `Learner's submitted answer:` → an **answer-check** response
  whose `output_text` is a JSON string:
  - if it also contains `ADOPT-ME` → `{"verdict":"valid","suggestedAnswer":"la mejor
    versión","critiqueMarkdown":"- **valid** alternative"}`
  - else → `{"verdict":"invalid","suggestedAnswer":null,"critiqueMarkdown":"- **wrong**:
    stubbed critique"}`
- else keep the existing `TRIGGER-EXPLAIN-FAILURE` (500), follow-up
  (`Learner's question:`), and explanation branches unchanged.

(The answer-check `output_text` is the JSON itself, since the generator `JSON.parse`es
`output_text`.) Keep the request counter for cache assertions.

#### 2. Specs

**File**: `e2e/explain.spec.ts` (extend; reuse `logIn`/`wipeAllCards`/`createCard`/
`resetStub`/`stubRequestCount`):

- **Gating:** a `correct` submission (type the exact answer) shows no "Explain more"
  button in the modal; an `incorrect` submission does.
- **Invalid happy path + cache:** create `en<->es` card, type a wrong answer, open
  modal, click "Explain more" → critique shown, no Adopt button. Close/reopen the modal,
  click again with the same wrong answer → result shown and `__requests` unchanged
  (cached) beyond the first check.
- **Valid + Adopt:** type a wrong answer containing `ADOPT-ME`, "Explain more" →
  `valid` framing + Adopt visible; click Adopt → modal closes and the answer slot's edit
  input is pre-filled with `la mejor versión`; press Enter → `.correct-answer` shows the
  new text and `/api/cards` reflects it.
- **Keyboard:** with the modal open on an `incorrect` card, pressing `e` triggers the
  answer-check (critique appears) without closing the modal.
- **Failure isolation:** card with normal texts, type `TRIGGER-CHECK-FAILURE` → base
  explanation still renders; "Explain more" shows the recoverable inline error + Retry.

#### 3. Docs

**File**: `README.md` — one line noting Explain-more (answer checking + adopt) and that
the e2e stub covers it. No new env vars or ports (config + e2e plumbing already carry
`OPENAI_*`), so `CLAUDE.md`, `.env.example`, and the port table are unchanged.

### Success Criteria

#### Automated Verification

- [x] `pnpm e2e` passes end to end including the new cases, with no OpenAI egress
      (stub `__requests` assertions prove local handling)
- [x] `pnpm typecheck` and `pnpm test` still pass

#### Manual Verification

- [ ] Full dev smoke with a real key (see Testing Strategy).

---

## Testing Strategy

### Unit Tests

- `server/tests/explanations/answer-check-service.test.ts` — cache-hit short-circuit,
  miss → generate+insert, unconfigured, generator failure, direction→prompt/expected
  selection.
- `server/tests/explanations/routes.test.ts` — the new `answer-check` describe block
  (validation, guards, 502s, 200 shapes for valid/invalid, cached vs generated), plus
  the `startServer` positional-index update.
- Optionally a small `parseAnswerCheck` unit test (valid JSON, bad verdict, suggested
  forced null when invalid, malformed → throw), since it guards the LLM boundary.

### Integration / E2E

- `e2e/explain.spec.ts` as specified in Phase 5, all against the local stub.

### Manual Testing Steps

1. `pnpm dev`; in `/train` on an `en<->es` card, type a **wrong but valid** alternate
   (e.g. a genuine synonym); check → "Explain more" → confirm `valid` framing + a
   sensible suggested wording; Adopt → the inline edit pre-fills; Enter → saved; verify
   on `CardsPage` and that the schedule/`due` is unchanged.
2. Type a **genuinely wrong** answer (bad tense/agreement); "Explain more" → a specific,
   targeted critique and **no** Adopt.
3. Reopen Explain with the same wrong answer → the answer-check is instant (cached).
4. Confirm "Explain more" is absent for `correct` / `correctWithDifferences` answers and
   in `/learn` (FlipCard).
5. Temporarily break the key (or use the failure sentinel) → base explanation still
   renders; "Explain more" shows the recoverable inline error.
6. Phone-width viewport: modal with base explanation + answer-check + follow-up scrolls
   and stays readable.

## Performance Considerations

One model call per novel (answer-pair + direction + normalized-submission), ever; all
else is a single indexed SELECT. Cost is negligible for a single user (same ~$0.0016
order as the base explanation; capped at 500 output tokens, `reasoning.effort: 'none'`,
20s timeout + 1 retry). The idea notes the cache's realistic value is de-duping within a
close/reopen rather than long-term reuse, plus dedup across identical cards from the
text-pair keying.

## Migration Notes

Additive migration with a real `down`; `pnpm migrate:up` on dev, and prod runs migrations
at container start, so `pnpm ship` picks it up. No prod env changes needed
(`OPENAI_SECRET_KEY` already required by the base explain feature).

## References

- Idea document: `meta/ideas/explain-answer-checking.md`
- Base explain plan: `meta/plans/2026-06-12-explain-translations.md`
- Follow-up chat plan: `meta/plans/2026-06-15-explain-quick-chat.md`
- Inline card edit plan: `meta/plans/2026-06-20-inline-card-edit.md`
- LLM boundary + generators: `server/src/explanations/llm.ts`
- Cache-first service + repository: `server/src/explanations/service.ts`,
  `repository.ts`
- Route DI pattern: `server/src/explanations/routes.ts:12-34`, tests
  `server/tests/explanations/routes.test.ts:48-63`
- Checker + normalization: `client/src/training/answer-check.ts:34-58`
- Modal: `client/src/explain/ExplanationModal.tsx`
- Reveal/verdict + save path: `client/src/training/TrainPage.tsx:104-158,270-297`,
  `client/src/training/AnswerReveal.tsx`, `client/src/cards/EditableSentence.tsx`
- Direction helpers: `client/src/training/direction.ts`
- E2E stub + specs: `e2e/openai-stub.ts`, `e2e/explain.spec.ts`
- Related deferred idea (not in scope): `meta/ideas/rating-based-correct-stat.md`
