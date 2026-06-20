---
type: plan
id: "2026-06-20-mistake-history-capture"
title: "Mistake History Capture Implementation Plan"
date: "2026-06-20T10:48:36+00:00"
author: "Anthony Scatchell"
producer: create-plan
status: draft
tags: [training, analytics, schema]
revision: "21771ae1fd028b0cd516b9ceb447b8e5333dbac6"
repository: "spanish-cards"
last_updated: "2026-06-20T10:48:36+00:00"
last_updated_by: "Anthony Scatchell"
schema_version: 1
---

# Mistake History Capture Implementation Plan

## Overview

Durably capture every training attempt in a new, fully independent
`review_history` table — the correct phrase (snapshotted), the exact text the
user typed, the three-state verdict, direction, rating, and a timestamp — so a
future analysis feature can mine recurring problem areas. This phase is
**storage only**: no analysis, dashboard, or UI change. Today the app computes
all of this client-side to render the highlight reveal, then throws it away;
only a single boolean (`detected_correct`) survives, on the `reviews` table.

## Current State Analysis

The review submission flow is fully understood:

- **Client** (`client/src/training/TrainPage.tsx:103`) computes
  `checkAnswer(typed, answerText(...))` on reveal, holding both `reveal.submitted`
  (raw typed text) and `reveal.result.verdict` (three-state
  `correct`/`correctWithDifferences`/`incorrect`). At rate time
  (`TrainPage.tsx:109-112`) it collapses the verdict to
  `detectedCorrect = verdict !== 'incorrect'` and POSTs
  `{ cardId, rating, direction, detectedCorrect }` via `submitReview`
  (`client/src/api.ts:127`). **The raw typed text and the three-state verdict
  never leave the client today.**
- **Server** validates with `parseReviewRequest` (`server/src/training/validation.ts:21`),
  then `recordReview` (`server/src/training/service.ts:16`) runs, inside one
  `withTransaction`: `upsertSchedule` + `insertReview` into `reviews`
  (`server/src/training/repository.ts:114,162`).
- **`wasDue` is computed server-side** from the card's effective due time, not
  trusted from the client (`service.ts:21-25`) — a precedent we follow for the
  derived `detectedCorrect`.

### Key Discoveries:

- Migrations are node-pg-migrate `.cjs` files; `reviews`
  (`server/migrations/1760000000000_create-reviews.cjs`) is the exact template —
  `id: 'id'` serial PK, `varchar` for enum-like values (no PG enums/checks),
  `timestamptz` with `default: pgm.func('now()')`, `down` is just `dropTable`.
- Enum-like values follow a TS `const`-tuple + type-guard convention:
  `PROMPT_DIRECTIONS`/`isPromptDirection` (`validation.ts:4-9`),
  `REVIEW_RATINGS`/`isReviewRating` (`scheduler.ts:19-22`). **No server-side
  `Verdict` type exists** — it lives only in the client at
  `client/src/training/answer-check.ts:10`. This plan adds the server-side
  counterpart.
- Card text is capped at `varchar(70)` (`server/migrations/1718000000000_create-cards.cjs:6`),
  so the snapshotted correct phrase fits `varchar(70)`. Only the submitted text
  is unbounded (chosen: `varchar(255)`).
- `getCard(db, id)` (`server/src/cards/repository.ts:60`) returns a `Card` with
  `spanishText`/`englishText`; the correct phrase for a direction is the
  *answer* side: `spanish-to-english` → `englishText`, `english-to-spanish` →
  `spanishText`.
- The repository insert pattern (`NewReview` interface + parameterized
  `insertReview(db: DbQueryable, ...)`, `Promise<void>`) is cloned directly.
- Existing error-logging convention is `console.error('message:', err)`
  (`server/src/explanations/routes.ts:66`, `mcp/routes.ts:41`).
- `withTransaction` (`server/src/db.ts:14`) does BEGIN/COMMIT/ROLLBACK and is
  the core atomic boundary we deliberately keep the history write **out of**.

## Desired End State

After this plan: every answered card, including fully-correct ones, produces
exactly one `review_history` row under normal operation, with the correct
phrase, submitted text, verdict, direction, rating, card id, and timestamp.
The table has **no foreign key** to any other table. The live training
experience (prompt → type → reveal → rate → next) is byte-for-byte identical
from the user's perspective, with no added latency. Verifiable by training a
few cards and running `SELECT * FROM review_history;` against the dev DB.

## What We're NOT Doing

- No analysis, aggregation, dashboard, or "what to study" logic.
- No UI or behavior change to the training flow.
- No word-level mistake extraction or categorization at write time — full
  phrases only.
- No retention/cleanup automation (manual pruning by timestamp is a future
  capability, deliberately enabled by the `attempted_at` index but not built).
- No server-side move of the diff/highlight computation — `answer-check.ts`
  stays client-only and unchanged.
- No foreign key, no `ON DELETE CASCADE` link to `cards`/`reviews`.
- No frontend max-length input validation (a future nicety; the
  `varchar(255)` column + server-side defensive truncation suffice for now).

## Implementation Approach

Three phases, developed in order: schema → server → client. The request
contract change (replace `detectedCorrect` in the payload with `verdict` +
`submittedText`, derive `detectedCorrect` server-side) is a coordinated
client+server change for this single-user app — both ship together via
`pnpm ship`. The core schedule+review transaction is left untouched; the
`review_history` write is a **best-effort side effect after** that transaction
commits, wrapped in try/catch that logs and swallows — so a history failure can
never roll back or fail a review.

---

## Phase 1: `review_history` Table Migration

### Overview

Add the standalone, FK-free `review_history` table.

### Changes Required:

#### 1. New migration

**File**: `server/migrations/1772000000000_create-review-history.cjs`
**Changes**: Create the table modeled on the `reviews` migration, but with **no
`references`/`onDelete`** on `card_id`, plus the snapshot columns.

```js
/* eslint-disable camelcase */

// Append-only analytical log of every training attempt. Deliberately
// independent: NO foreign key to cards/reviews, every analysis field
// snapshotted onto the row. Write-only from the app's perspective in this
// phase; a future analysis feature is the only intended reader. Safe to prune
// by attempted_at later with no cross-table cleanup.
exports.up = (pgm) => {
  pgm.createTable('review_history', {
    id: 'id',
    // Informational/debugging reference only — intentionally NOT a foreign key,
    // so deleting a card never touches history (and vice versa).
    card_id: { type: 'integer', notNull: true },
    // Prompt direction trained: 'spanish-to-english' | 'english-to-spanish'.
    direction: { type: 'varchar(20)', notNull: true },
    // Three-state verdict: 'correct' | 'correctWithDifferences' | 'incorrect'.
    verdict: { type: 'varchar(25)', notNull: true },
    // FSRS rating chosen: 'again' | 'hard' | 'good' | 'easy'.
    rating: { type: 'varchar(5)', notNull: true },
    // The expected answer phrase, snapshotted at attempt time (card text is
    // capped at varchar(70), so this can never overflow).
    correct_text: { type: 'varchar(70)', notNull: true },
    // The raw text the user submitted (may be empty if they didn't remember).
    submitted_text: { type: 'varchar(255)', notNull: true },
    attempted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Supports future time-based analysis and timestamp pruning.
  pgm.createIndex('review_history', 'attempted_at');
};

exports.down = (pgm) => {
  pgm.dropTable('review_history');
};
```

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `pnpm migrate:up`
- [ ] Migration reverts cleanly: `pnpm migrate:down` then `pnpm migrate:up` again
- [ ] Type checking passes: `pnpm typecheck`

#### Manual Verification:

- [ ] `\d review_history` in psql shows no foreign key on `card_id` and the
      `attempted_at` index present.

---

## Phase 2: Server — Contract Change, Verdict Type, Best-Effort History Write

### Overview

Replace `detectedCorrect` in the request with `verdict` + `submittedText`;
derive `detectedCorrect` server-side (keeping the `reviews` write identical);
add the `review_history` repository insert; perform the snapshot + best-effort
write in `recordReview` after the core transaction.

### Changes Required:

#### 1. Server-side `Verdict` type + guard

**File**: `server/src/training/validation.ts`
**Changes**: Add a `VERDICTS` tuple + `isVerdict` guard (mirroring
`PROMPT_DIRECTIONS`), change `ReviewRequest` to carry `verdict` + `submittedText`
instead of `detectedCorrect`, and update `parseReviewRequest`. `submittedText`
is validated as a string only — **an empty string is valid** (the user left the
answer blank).

```ts
export const VERDICTS = ['correct', 'correctWithDifferences', 'incorrect'] as const;
export type Verdict = (typeof VERDICTS)[number];

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value);
}

// A validated review submission. The three-state `verdict` is the
// answer-checker's result; `detectedCorrect` is derived from it server-side.
// `submittedText` is the raw text the user typed (may be empty).
export interface ReviewRequest {
  cardId: number;
  rating: ReviewRating;
  direction: PromptDirection;
  verdict: Verdict;
  submittedText: string;
}

export function parseReviewRequest(body: unknown): ReviewRequest | null {
  const { cardId, rating, direction, verdict, submittedText } =
    (body ?? {}) as Record<string, unknown>;
  if (
    !Number.isInteger(cardId) ||
    !isReviewRating(rating) ||
    !isPromptDirection(direction) ||
    !isVerdict(verdict) ||
    typeof submittedText !== 'string'
  ) {
    return null;
  }
  return { cardId: cardId as number, rating, direction, verdict, submittedText };
}
```

#### 2. `review_history` repository insert

**File**: `server/src/training/repository.ts`
**Changes**: Add a `NewReviewHistory` interface + `insertReviewHistory`,
cloning the `insertReview` style (positional params, `DbQueryable`, `void`).
Import `Verdict` from `./validation.js` (organize at top of file).

```ts
export interface NewReviewHistory {
  cardId: number;
  direction: PromptDirection;
  verdict: Verdict;
  rating: ReviewRating;
  correctText: string;
  submittedText: string;
  attemptedAt: Date;
}

export async function insertReviewHistory(
  db: DbQueryable,
  history: NewReviewHistory,
): Promise<void> {
  await db.query(
    `INSERT INTO review_history
       (card_id, direction, verdict, rating, correct_text, submitted_text, attempted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      history.cardId,
      history.direction,
      history.verdict,
      history.rating,
      history.correctText,
      history.submittedText,
      history.attemptedAt,
    ],
  );
}
```

#### 3. Derive `detectedCorrect`; best-effort history capture

**File**: `server/src/training/service.ts`
**Changes**: Derive `detectedCorrect` from `request.verdict` and feed it to the
unchanged `insertReview`. After the core transaction commits, snapshot the
correct phrase via `getCard` and write the history row in a try/catch that
logs and swallows. Defensively `slice(0, 255)` the submitted text so an
over-long string can never throw a `value too long` error and lose the row.
Add `getCard` (from `../cards/repository.js`) and `insertReviewHistory` imports
at the top.

```ts
const detectedCorrect = request.verdict !== 'incorrect';
const current = await getSchedule(pool, request.cardId);
const next = rateSchedule(current, request.rating, now);
await withTransaction(pool, async (tx) => {
  await upsertSchedule(tx, request.cardId, next);
  await insertReview(tx, {
    cardId: request.cardId,
    direction: request.direction,
    detectedCorrect,
    rating: request.rating,
    wasDue,
    reviewedAt: now,
  });
});

// Best-effort, supplementary capture: must never fail or roll back the review
// above. Snapshots the expected answer phrase as it exists right now.
try {
  const card = await getCard(pool, request.cardId);
  if (card) {
    const correctText =
      request.direction === 'spanish-to-english' ? card.englishText : card.spanishText;
    await insertReviewHistory(pool, {
      cardId: request.cardId,
      direction: request.direction,
      verdict: request.verdict,
      rating: request.rating,
      correctText,
      submittedText: request.submittedText.slice(0, 255),
      attemptedAt: now,
    });
  }
} catch (err) {
  console.error('Review history capture failed:', err);
}

return { due: next.due, wasDue };
```

> Note: `getCard` runs on `pool` (outside the committed transaction) — matching
> the existing read-before-write style and keeping history fully off the
> critical path. The 400 error message in `routes.ts:18-22` must be updated to
> describe the new body shape.

#### 4. Update the route's 400 message

**File**: `server/src/training/routes.ts:18-22`
**Changes**: Update the error string to
`'Body must be { cardId, rating, direction, verdict, submittedText } with rating one of again/hard/good/easy and verdict one of correct/correctWithDifferences/incorrect'`.

#### 5. Update validation unit tests

**File**: `server/tests/training/validation.test.ts`
**Changes**: Change `validBody` to the new shape (drop `detectedCorrect`, add
`verdict: 'correct'`, `submittedText: 'hola'`). Replace the
`detectedCorrect`-rejection test with: rejects unknown verdicts; rejects
non-string `submittedText`; **accepts an empty-string `submittedText`**; accepts
all three verdict values.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `pnpm test`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] Linting passes: `pnpm lint` (if defined; otherwise covered by typecheck)

#### Manual Verification:

- [ ] (Deferred to Phase 3 end-to-end check — server can't be exercised in
      isolation without the client sending the new payload.)

---

## Phase 3: Client — Send `verdict` + `submittedText`

### Overview

Update the client request type and submission to send the three-state verdict
and the raw typed text instead of the derived boolean. UI is unchanged.

### Changes Required:

#### 1. Request type + `submitReview`

**File**: `client/src/api.ts`
**Changes**: Update `ReviewSubmission` to drop `detectedCorrect` and add
`verdict` + `submittedText`. Import the `Verdict` type from
`./training/answer-check.js` (organize imports at top of file).

```ts
import type { Verdict } from './training/answer-check.js';

export interface ReviewSubmission {
  cardId: number;
  rating: ReviewRating;
  direction: 'spanish-to-english' | 'english-to-spanish';
  // The answer-checker's three-state verdict. The server derives its own
  // detectedCorrect from this.
  verdict: Verdict;
  // The raw text the user typed (may be empty).
  submittedText: string;
}
```

`submitReview`'s body already serializes the whole `ReviewSubmission`, so no
change to its implementation.

#### 2. Submission call

**File**: `client/src/training/TrainPage.tsx:107-118`
**Changes**: In `handleRate`, keep the local `detectedCorrect` derivation for
the session correct-count UI (lines 109, 117), but change the `submitReview`
call to send the verdict and submitted text:

```ts
await submitReview({
  cardId: currentCard.id,
  rating,
  direction,
  verdict: reveal.result.verdict,
  submittedText: reveal.submitted,
});
```

### Success Criteria:

#### Automated Verification:

- [ ] Client unit tests pass: `pnpm test`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] End-to-end suite passes: `pnpm e2e`

#### Manual Verification:

- [ ] With `pnpm dev`, train several cards (correct, accent-only slip, wrong,
      and a blank answer) across both directions.
- [ ] `SELECT card_id, direction, verdict, rating, correct_text, submitted_text,
      attempted_at FROM review_history ORDER BY attempted_at;` shows one row per
      attempt with correct/submitted text intact and the right three-state
      verdict (including `correctWithDifferences` for the accent slip and an
      empty `submitted_text` for the blank answer).
- [ ] Training feels identical — no added latency or UI change.
- [ ] Delete a card via the UI; confirm its prior `review_history` rows remain
      (now with a dangling, non-enforced `card_id`).

---

## Testing Strategy

### Unit Tests:

- `validation.test.ts`: new body shape; verdict guard (all three values +
  rejection of unknown); `submittedText` must be a string; empty string
  accepted.
- No service-layer unit test exists (it has a DB dependency); the service path
  is covered by the e2e suite, consistent with the current codebase.

### Integration / E2E Tests:

- The existing `e2e/training.spec.ts` exercises the full submit flow through the
  UI and must continue to pass after the coordinated client+server contract
  change. Optionally extend it to assert a `review_history` row is written, but
  that is not required for this phase.

### Manual Testing Steps:

1. `pnpm dev`, train a correct answer, an accent-only slip, a wrong answer, and
   a blank answer, in both directions.
2. Query `review_history`; verify one row per attempt with intact text and the
   correct verdict.
3. Delete a trained card; verify its history rows persist unaffected.

## Performance Considerations

One extra `SELECT` (`getCard`) and one `INSERT` per review, both **after** the
core transaction commits and off the response's critical path conceptually
(they still precede the HTTP response but are trivial for a single user).
Acceptable; no added perceived latency. The `attempted_at` index keeps future
time-range queries and pruning cheap.

## Migration Notes

Forward-only additive migration; no backfill (historical attempts were never
captured and cannot be reconstructed). `pnpm migrate:down` cleanly drops the
table. The client+server contract change must deploy together (`pnpm ship`
builds and serves both from one container), so there is no mixed-version window
in practice for this single-user app.

## References

- Idea doc: `meta/ideas/mistake-history-capture.md`
- Template migration: `server/migrations/1760000000000_create-reviews.cjs`
- Core write path: `server/src/training/service.ts:16`,
  `server/src/training/repository.ts:114,162`
- Verdict source (client-only): `client/src/training/answer-check.ts:10,34`
- Card lookup: `server/src/cards/repository.ts:60`
- Related plan: `meta/plans/02-typed-training-fsrs.md`,
  `meta/plans/2026-06-15-answer-diff-jsdiff.md`
