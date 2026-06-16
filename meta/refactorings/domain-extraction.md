# Domain Object Extraction

Candidates where logic that belongs to a concept is currently scattered across
files. Ordered by payoff-to-effort ratio.

---

## 1. `AnswerCheckResult` — absorb derived properties

**Current shape** (`client/src/training/answer-check.ts`)
```ts
interface AnswerCheckResult {
  verdict: Verdict;          // 'correct' | 'correctWithDifferences' | 'incorrect'
  correctSegments: DiffSegment[];
}
```

**Logic living outside it**

| File | What | Line |
|------|------|------|
| `training/TrainPage.tsx` | `verdict !== 'incorrect'` (as `detectedCorrect`) | 109 |
| `training/TrainPage.tsx` | `verdict !== 'incorrect'` again (as `isCorrect`) | 146 |
| `training/AnswerReveal.tsx` | Filter `extra` segments + collapse spaces to get display text | 11–15 |

**What moves**

```ts
// Proposed additions to AnswerCheckResult (or a thin wrapper / namespace)

isAccepted: boolean          // verdict !== 'incorrect'
correctText: string          // segments minus 'extra', spaces collapsed
```

`isAccepted` is the right name for the concept — "the system accepts this
answer for rating purposes, whether perfect or with differences". The raw
`verdict` string comparison is repeated twice in `TrainPage` and shouldn't be.

`correctText` is currently inlined in `AnswerReveal` as a derivation from
`correctSegments`. That derivation belongs with the data, not in the renderer.

**Effort**: Small. Both additions can be computed in `checkAnswer` and added to
the returned object, or exposed as helper functions co-located in
`answer-check.ts`. No new files needed.

---

## 2. Card due-status helpers

**Current shape** (`client/src/api.ts`)
```ts
interface Card {
  reviewed: boolean;   // false → never reviewed, always due
  due: string;         // ISO datetime
  languagePair: string;
  ...
}
```

**Logic scattered outside it**

| File | What | Lines |
|------|------|-------|
| `cards/sort.ts` | `!card.reviewed` (is new), `new Date(card.due) <= now` (is due) | 3–6 |
| `cards/CardDueStatus.tsx` | `card.reviewed ? status : 'New · due now'` re-encodes the same new/due split | 8–12 |

These two predicates — "is this card new" and "is it due now" — are derived
independently in two separate files. If the definition of "due" changed (e.g. a
grace period), both would need updating.

**What moves**

```ts
// client/src/cards/card-status.ts (new small file, or added to sort.ts)

export function isNew(card: Card): boolean {
  return !card.reviewed;
}

export function isDue(card: Card, now = new Date()): boolean {
  return !card.reviewed || new Date(card.due) <= now;
}
```

`sort.ts` and `CardDueStatus` both import these instead of re-deriving them.

**Note on `canExplain`**: already a function in `explain/canExplain.ts`. It's
fine where it is — a one-liner module for a domain capability check is clear.
No need to move it onto the card.

**Effort**: Small. Extract two functions, update two call sites.

---

## What to leave alone

- **`CardSides` / direction dispatch** (`training/direction.ts`) — `promptText`
  and `answerText` are four lines and called in one place. No duplication, no
  scattered logic. Wrapping them in an object adds indirection without payoff.

- **`LearningSession`** (`client/src/learning/session.ts`) — pure functions
  on a typed session, well co-located. Nothing is scattered.

- **`CardSchedule`** (`server/src/training/scheduler.ts`) — FSRS adapter,
  `rateSchedule`, and `learningStage` are already together.

- **`Draft`** (`client/src/cards/drafts.ts`) — reducer + helpers are
  self-contained.

- **`DiffSegment[]`** — an implementation detail of `AnswerCheckResult`, not a
  domain concept in its own right. Exposing it through `AnswerCheckResult`
  (see above) is sufficient.
