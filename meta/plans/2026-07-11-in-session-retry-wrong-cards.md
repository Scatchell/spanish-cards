---
type: plan
id: "2026-07-11-in-session-retry-wrong-cards"
title: "In-Session Retry of Wrong Cards Implementation Plan"
date: "2026-07-11T13:54:45Z"
author: "Anthony Scatchell"
producer: create-plan
status: draft
tags: [training, ux, spaced-repetition]
revision: "8ec0dc26f82a261caa790f6a9a78cd2018594d7c"
repository: "spanish-cards"
last_updated: "2026-07-11T13:54:45Z"
last_updated_by: "Anthony Scatchell"
schema_version: 1
---

# In-Session Retry of Wrong Cards Implementation Plan

## Overview

When a user rates a training card **"Don't remember"** (`again`), re-surface that
card again later in the *same* training session — after a random gap of **4-6
cards** — as a lightweight flip-card recognition check ("Remembered" / "Still
learning"), looping until they get it. This gives a rapid second chance without
showing the card immediately, and without waiting for a whole new session.

The retry is **purely client-side rehearsal**: it never calls the review API, so
it never re-runs FSRS, never overwrites the due date the graded "again" already
scheduled, and never pollutes review history or accuracy stats.

## Current State Analysis

**Training flow** (`client/src/training/TrainPage.tsx`):

- The session queue is a raw `TrainingCard[]` in component state
  (`TrainPage.tsx:34`), fetched once at session start via `fetchTrainingQueue`
  (`TrainPage.tsx:57-73`) and ordered oldest-due-first by the server
  (`server/src/training/repository.ts:40-61`). No shuffle, no reordering.
- On rating, the card is graded server-side (FSRS) via `submitReview`, then
  removed from the queue immediately: `setQueue((cards) => cards.slice(1))`
  (`TrainPage.tsx:119`). Correct or wrong, a card is seen **once** per session.
- Session progress is tracked in a `Session` object `{ total, reviewed, correct }`
  (`TrainPage.tsx:26-30, 35`); the position indicator is
  `cardPosition = session.total - queue.length + 1` (`TrainPage.tsx:174`) and the
  done screen shows accuracy via `SessionSummary` (`TrainPage.tsx:305-316`).
- Wrong cards only reappear in a *future* session, when their FSRS `due` date has
  passed — never within the current session.

**Learn flow** (the pattern to reuse):

- `client/src/learning/session.ts` is a clean, fully-tested pure-domain module:
  `LearningSession` state + pure functions (`startSession`, `currentCard`,
  `markRemembered`, `markStillLearning`, `updateCardInSession`) that take an
  injectable `Rng`. `markStillLearning` (`session.ts:45-58`) already reinserts a
  card at a random slot in the remaining queue — the exact mechanic we want, but
  positioned in the *back half* rather than a fixed 4-6 window.
- The flip-card **UI** ("Show answer (Space)" → **Remembered (1)** / **Still
  learning (2)**, with an Explain button + modal) is currently inline inside
  `LearnPage.tsx:200-267`, driven by page-level `showBack`/`explainOpen` state and
  a keyboard effect (`LearnPage.tsx:140-167`). It is **not** yet a reusable
  component. The screenshot supplied by the user confirms the exact labels.

### Key Discoveries:

- **Retry trigger is a clean existing signal**: `rating === 'again'` is only
  offered for detected-incorrect/empty answers (`RatingBar.tsx:37-38`,
  `allowAgain={!isCorrect}`), and a user who "remembered it anyway" overrides to
  Hard/Good/Easy. So `rating === 'again'` == "user confirmed they didn't
  remember" — the precise, user-controlled retry trigger.
- **The domain pattern already exists** in `learning/session.ts` and is the
  template for the new training queue module (pure functions + injectable `Rng` +
  colocated tests in `client/tests/learning/session.test.ts`).
- **No LearnPage component test exists** (only `session`, `selection`,
  `answer-check`, `AnswerReveal` tests under `client/tests/`), so extracting the
  flip card is lower-risk; testing-library is already available
  (`client/tests/training/AnswerReveal.test.tsx`).
- **Position math must stay consistent**: today's denominator is `session.total`.
  As retries grow the queue, the denominator must grow with it, so the domain
  module should own a `served` counter and derive position/remaining from the
  queue rather than a fixed total.

## Desired End State

A user training a large batch who gets a card wrong (rates "Don't remember"):

1. Continues answering scheduled cards as normal (typed recall, FSRS grading
   unchanged).
2. After 4-6 more cards, the wrong card reappears as a **flip card** (no typing):
   prompt shown, "Show answer" reveals the back, then **Remembered** / **Still
   learning**.
3. "Remembered" drops it from the session; "Still learning" re-queues it another
   4-6 cards out, looping until remembered.
4. The graded review (and its FSRS schedule) is untouched by any of this; the
   done-screen accuracy percentage reflects only graded reviews, not retries.
5. Edge case — fewer than 4 cards remain: the retry is appended with the maximum
   available spacing (i.e. at the end of the remaining queue).

Verify by: training with a small deck, deliberately rating a card "Don't
remember", and confirming it returns a few cards later as a flip card and loops
until remembered, with no extra rows in `reviews`/`review_history` for the retry
reps.

## What We're NOT Doing

- **No backend, schema, API, or FSRS changes.** The graded "again" already sets
  the correct long-term due date; retries are ephemeral client rehearsal only.
- **Not persisting** retry state across refresh/navigation (matches Learn — the
  session is component state and lost on refresh by design).
- **Not adding typed recall** on retries — the retry is a flip-card recognition
  check per the agreed UX.
- **Not retrying** cards the user typed wrong but self-rated Hard/Good/Easy
  ("remembered anyway"). Only `rating === 'again'` triggers a retry.
- **Not changing** the ordering, fetch, or "study ahead" behavior of the
  scheduled queue itself.
- **Not counting** retry reps toward the session accuracy stats.

## Implementation Approach

Three phases, each independently verifiable:

1. **Extract** the inline Learn flip-card into a reusable presentational
   component (pure refactor, no behavior change) so both Learn and Train retries
   render identical UI from one source.
2. **Build** a training-session domain module (`training/queue.ts`) that
   encapsulates the queue + retry logic as pure, `Rng`-injectable functions
   (mirroring `learning/session.ts`), with colocated unit tests. No UI wiring
   yet.
3. **Wire** `TrainPage` onto the domain module and render the extracted flip card
   in retry mode.

Splitting the pure domain logic (Phase 2) from the component wiring (Phase 3)
keeps the tricky positioning/looping logic fully unit-testable without React, and
keeps `TrainPage` thin — directly addressing the "encapsulate the queue logic"
goal.

---

## Phase 1: Extract shared flip-card component

### Overview

Move the inline flip-card markup + interaction (show/hide answer, Remembered /
Still learning, Explain, keyboard shortcuts Space/1/2/E) out of `LearnPage` into a
reusable component. Pure refactor: Learn behaves identically afterwards.

### Changes Required:

#### 1. New shared component

**File**: `client/src/cards/FlipCard.tsx` (new — `cards/` already holds shared
card UI like `EditableSentence`, `CardDueStatus`)

**Changes**: A presentational flip card that owns its own `showBack` and
`explainOpen` state, resets `showBack` to hidden whenever the card identity or
direction changes, and binds the keyboard shortcuts (Space = flip, 1 =
remembered, 2 = still learning, E = explain when back shown & explainable).

```tsx
interface FlipCardProps {
  card: Card;                       // or the minimal shape shared by Learn/Train cards
  direction: Direction;
  onRemembered: () => void;
  onStillLearning: () => void;
  // Optional inline-edit support (Learn passes these; Train retry may omit).
  onSavePrompt?: (newText: string) => Promise<void>;
  onSaveAnswer?: (newText: string) => Promise<void>;
  rememberedLabel?: string;         // default "Remembered"
  stillLearningLabel?: string;      // default "Still learning"
}
```

Renders: prompt (`EditableSentence`), concealed answer row (unchanged
`learn-answer-row` / `concealed` classes so layout stays stable), "Show answer
(Space)" button, `ExplainButton` + `ExplanationModal` when applicable, and the two
action buttons with `(1)`/`(2)` shortcut hints. Move the keyboard effect from
`LearnPage.tsx:140-167` into this component (dropping the `Digit1/Digit2` numpad
map, `DIGIT_BY_CODE`, alongside it).

#### 2. LearnPage uses the component

**File**: `client/src/learning/LearnPage.tsx`
**Changes**: Replace the inline block (`LearnPage.tsx:200-267`, keeping the
`train-meta`/"Remembered X of Y" header row and outer `<section>`) with
`<FlipCard .../>`. Remove the now-owned `showBack`/`explainOpen` state, the
keyboard effect, and `DIGIT_BY_CODE`. Keep `advance`/`markRemembered`/
`markStillLearning` wiring via the `onRemembered`/`onStillLearning` props and the
`saveCardField` callbacks via `onSavePrompt`/`onSaveAnswer`.

#### 3. Component test

**File**: `client/tests/cards/FlipCard.test.tsx` (new)
**Changes**: Render, assert answer hidden initially, Show-answer/Space reveals it,
`1`/`2` and button clicks invoke the callbacks, `aria-hidden` toggles.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Unit tests pass: `pnpm test`
- [x] New `FlipCard.test.tsx` passes

#### Manual Verification:
- [ ] Learn flow looks and behaves exactly as before (flip, Remembered, Still
  learning, Explain, Space/1/2/E shortcuts, inline edit)
- [ ] Direction toggle in Learn still re-hides the answer

---

## Phase 2: Training-session domain module

### Overview

Introduce a pure domain module that encapsulates the training queue, the retry
positioning (4-6 cards, clamped), the loop-until-remembered behavior, and the
session stats — mirroring `learning/session.ts`. No React, fully unit-tested.

### Changes Required:

#### 1. Domain module

**File**: `client/src/training/queue.ts` (new)

**Changes**:

```ts
import type { TrainingCard } from '../api.js';

export type Rng = () => number;
export type QueuedKind = 'scheduled' | 'retry';

export interface QueuedCard {
  card: TrainingCard;
  kind: QueuedKind;
}

export interface TrainingSession {
  queue: QueuedCard[];   // head = current card
  served: number;        // cards advanced past (scheduled + retry reps)
  reviewed: number;      // graded scheduled reviews recorded
  correct: number;       // graded reviews detected correct
}

// Retry re-surfaces after a random gap; clamped to the remaining queue length so
// a near-empty queue appends with maximum available spacing.
const RETRY_MIN_GAP = 4;
const RETRY_MAX_GAP = 6;

export function startSession(cards: TrainingCard[]): TrainingSession {
  return {
    queue: cards.map((card) => ({ card, kind: 'scheduled' as const })),
    served: 0,
    reviewed: 0,
    correct: 0,
  };
}

export function currentCard(s: TrainingSession): QueuedCard | undefined {
  return s.queue[0];
}

// Position/remaining derived from served + queue (denominator grows with retries).
export function position(s: TrainingSession): number { return s.served + 1; }
export function totalCount(s: TrainingSession): number { return s.served + s.queue.length; }

// Advance a graded (scheduled) card. `requeueAsRetry` is true only when the user
// rated it "again". Splices a retry copy at a random 4-6 gap when requested.
export function recordGraded(
  s: TrainingSession,
  opts: { detectedCorrect: boolean; requeueAsRetry: boolean },
  rng: Rng = Math.random,
): TrainingSession {
  const [head, ...rest] = s.queue;
  if (!head) return s;
  const queue = opts.requeueAsRetry ? spliceRetry(rest, head.card, rng) : rest;
  return {
    queue,
    served: s.served + 1,
    reviewed: s.reviewed + 1,
    correct: s.correct + (opts.detectedCorrect ? 1 : 0),
  };
}

// Resolve a retry rep. Not remembered -> re-queue again (loop). No stat changes.
export function resolveRetry(
  s: TrainingSession,
  opts: { remembered: boolean },
  rng: Rng = Math.random,
): TrainingSession {
  const [head, ...rest] = s.queue;
  if (!head) return s;
  const queue = opts.remembered ? rest : spliceRetry(rest, head.card, rng);
  return { ...s, queue, served: s.served + 1 };
}

// Patch a card's text wherever it appears (after a server-confirmed edit).
export function patchCard(
  s: TrainingSession,
  cardId: number,
  patch: Partial<Pick<TrainingCard, 'spanishText' | 'englishText'>>,
): TrainingSession {
  return {
    ...s,
    queue: s.queue.map((qc) =>
      qc.card.id === cardId ? { ...qc, card: { ...qc.card, ...patch } } : qc,
    ),
  };
}

function spliceRetry(rest: QueuedCard[], card: TrainingCard, rng: Rng): QueuedCard[] {
  const gap = RETRY_MIN_GAP + Math.floor(rng() * (RETRY_MAX_GAP - RETRY_MIN_GAP + 1)); // 4..6
  const index = Math.min(gap, rest.length); // clamp: append when < gap remain
  const retry: QueuedCard = { card, kind: 'retry' };
  return [...rest.slice(0, index), retry, ...rest.slice(index)];
}
```

#### 2. Domain tests

**File**: `client/tests/training/queue.test.ts` (new), modeled on
`client/tests/learning/session.test.ts` (deterministic `Rng` stub for placement
assertions).

Cover:
- `startSession` wraps every card as `scheduled`, stats zeroed.
- `recordGraded` without retry: removes head, `reviewed`/`served` +1,
  `correct` tracks `detectedCorrect`.
- `recordGraded` with `requeueAsRetry`: a single `retry` copy of the head is
  reinserted at index 4-6 (assert range across seeded RNG), original stats still
  advance.
- Clamp edge cases: with `rest.length` of 0, 1, 2, 3 the retry lands at the end
  (`index === rest.length`), and with 0 remaining it becomes the only card.
- `resolveRetry({remembered:true})` removes it; `{remembered:false}` re-queues
  another retry at 4-6 (loop), no stat changes.
- `patchCard` updates text for both scheduled and retry copies; no-op when no
  match.
- `position`/`totalCount` grow correctly as retries are added.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] `queue.test.ts` passes: `pnpm test`
- [x] Retry gap is provably within [4,6] and clamped to remaining length under a
  seeded RNG

#### Manual Verification:
- [x] (n/a — pure logic, covered by unit tests)

---

## Phase 3: Wire TrainPage onto the domain module + retry UI

### Overview

Replace `TrainPage`'s raw `queue` + `Session` state with the `TrainingSession`
domain object, render the extracted `FlipCard` when the current card is a retry,
and keep the typed/graded flow for scheduled cards.

### Changes Required:

#### 1. Swap state to the domain module

**File**: `client/src/training/TrainPage.tsx`

**Changes**:
- Replace `const [queue, setQueue] = useState<TrainingCard[]>([])` and
  `const [session, setSession] = useState<Session>(...)` with a single
  `const [session, setSession] = useState<TrainingSession>(() => startSession([]))`.
- `loadQueue`: `setSession(startSession(cards))`.
- `const current = currentCard(session)` and `const isRetry = current?.kind === 'retry'`;
  derive `currentCard`-shaped `card = current?.card`.
- `cardPosition` → `position(session)`; denominator → `totalCount(session)`.
- `saveCardField` uses `patchCard(session, ...)` instead of mapping a raw array.
- `SessionSummary` still reads `session.reviewed`/`session.correct` (retry reps
  never touch these), so accuracy stays honest.

#### 2. Graded rating queues a retry on "again"

**File**: `client/src/training/TrainPage.tsx` (`handleRate`, currently
`TrainPage.tsx:106-143`)

**Changes**: After a successful `submitReview`, replace the `slice(1)` +
stat-update block with:

```ts
setSession((s) =>
  recordGraded(s, {
    detectedCorrect,
    requeueAsRetry: rating === 'again',
  }),
);
```

(FSRS grading via `submitReview` is unchanged; the retry copy is purely local.)

#### 3. Render FlipCard in retry mode

**File**: `client/src/training/TrainPage.tsx` (render, around
`TrainPage.tsx:198-277`)

**Changes**: When `isRetry`, render the `train-meta` row (position now grows with
retries) plus `<FlipCard>` instead of the typed-answer form / `AnswerReveal` /
`RatingBar`. Wire:
- `onRemembered={() => setSession((s) => resolveRetry(s, { remembered: true }))}`
- `onStillLearning={() => setSession((s) => resolveRetry(s, { remembered: false }))}`
- `onSavePrompt`/`onSaveAnswer` reuse the existing `saveCardField` so inline edits
  still work during a retry.
- Reset `typed`/`reveal`/`explainOpen` on resolve, matching the scheduled flow.

Scheduled (non-retry) cards keep the existing typed form + `AnswerReveal` +
`RatingBar` path untouched. Because retry cards live in the same queue,
end-of-session and "study ahead" transitions require no changes — the done screen
appears only once every scheduled *and* retry card is resolved.

#### 4. Optional: distinguish retry in the meta row

**File**: `client/src/training/TrainPage.tsx`
**Changes**: Optionally show a small badge (e.g. "· second chance") in the
`train-meta` row when `isRetry`, so the user understands why a card returned as a
flip card. Low-risk, cosmetic.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Unit tests pass: `pnpm test`
- [ ] e2e training suite still passes: `pnpm e2e` (verify no spec assumed the
  session ends after exactly N graded cards in a way retries break)

#### Manual Verification:
- [ ] Rating a card "Don't remember" re-surfaces it as a flip card 4-6 cards later
- [ ] "Still learning" on the retry loops it back again with spacing; "Remembered"
  drops it
- [ ] With <4 cards left, the retry appends at the end (max available spacing);
  with 0 left, it becomes the only remaining card and must be resolved to finish
- [ ] "Card N of M" grows sensibly as retries are added; done-screen accuracy %
  reflects only graded reviews (retries excluded)
- [ ] No extra rows appear in `reviews`/`review_history` for retry reps (spot-check
  via the prod/dev DB query script or by counting reviews before/after a retry)
- [ ] Detected-wrong answers the user overrides to Hard/Good/Easy are **not**
  retried

---

## Testing Strategy

### Unit Tests:
- `client/tests/training/queue.test.ts` — placement range [4,6], clamping at
  0/1/2/3 remaining, loop-on-still-learning, stats isolation (retries don't move
  `reviewed`/`correct`), `patchCard`, `position`/`totalCount`. Use a seeded/stub
  `Rng` for deterministic placement assertions (as `session.test.ts` does).
- `client/tests/cards/FlipCard.test.tsx` — reveal toggle, keyboard shortcuts,
  callback invocation, `aria-hidden` behavior.

### Integration / e2e:
- Run `pnpm e2e` and confirm the existing training spec still passes. If it
  asserts a fixed session length, add/adjust a case that rates a card "Don't
  remember" and asserts it reappears and can be cleared.

### Manual Testing Steps:
1. `pnpm dev`, open the client, seed a small deck (e.g. 6-8 due cards).
2. Train; rate one card "Don't remember"; confirm it returns as a flip card 4-6
   cards later.
3. On the retry, click "Still learning"; confirm it loops back with spacing.
4. Click "Remembered"; confirm it leaves the session.
5. Rate the last remaining card "Don't remember"; confirm it immediately becomes
   the only card and must be resolved to reach the done screen.
6. Check the done-screen accuracy counts only graded reviews.
7. Confirm Learn still works identically (Phase 1 regression check).

## Performance Considerations

Negligible — all changes operate on an in-memory array of at most a session's
worth of cards; retry splicing is O(n) on a small list. No new network calls (the
retry deliberately makes none).

## Migration Notes

None — no schema, data, or API changes. Feature is client-only and ephemeral.

## References

- Prior discussion: this session's research into training/scheduling flow.
- Domain pattern to mirror: `client/src/learning/session.ts` +
  `client/tests/learning/session.test.ts`
- Flip-card UI source: `client/src/learning/LearnPage.tsx:200-267`
- Retry trigger signal: `client/src/training/RatingBar.tsx:37-38`,
  `client/src/training/TrainPage.tsx:106-143`
- Position/stats: `client/src/training/TrainPage.tsx:174, 305-316`
