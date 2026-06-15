---
type: plan
id: "2026-06-15-answer-diff-jsdiff"
title: "Answer Diff Highlighting via jsdiff Implementation Plan"
date: "2026-06-15T20:52:19Z"
author: "Anthony Scatchell"
producer: create-plan
status: draft
work_item_id: ""
parent: ""
reviewer: ""
tags: [training, diff, client]
revision: "5833fc9"
repository: "spanish-cards"
last_updated: "2026-06-15T20:52:19Z"
last_updated_by: "Anthony Scatchell"
schema_version: 1
---

# Answer Diff Highlighting via jsdiff Implementation Plan

## Overview

Replace the hand-written answer-diff logic in `client/src/training/answer-check.ts`
with a token-level alignment built on the [`diff`](https://www.npmjs.com/package/diff)
(jsdiff) library. The new diff shows three states when revealing the correct
answer: **missing** correct content the user omitted (yellow highlight, current
behaviour), **changed** characters inside an aligned word (yellow highlight,
char-level), and **extra** words the user typed that don't belong (yellow
highlight + strikethrough — new behaviour).

Worked example (English→Spanish reveal):

```
Entered:  Fuimos una pequeña de excursion, y perdimos
Correct:  Fuimos a hacer una pequeña excursión y nos perdimos.

Rendered: Fuimos [a hacer] una pequeña [de] excursión y [nos] perdimos.
```

where `[a hacer]`, `ó` (inside `excursión`), and `[nos]` are yellow highlights
(missing/changed), and `[de]` is yellow-highlighted with a strikethrough
(extra word the user typed).

## Current State Analysis

All answer-diff logic lives in `client/src/training/answer-check.ts` (131 lines)
and is rendered by `client/src/training/AnswerReveal.tsx`.

`checkAnswer(submitted, correctAnswer)` returns
`{ verdict, correctSegments }` where:

- `verdict: 'correct' | 'correctWithDifferences' | 'incorrect'` — drives the
  reveal copy and the auto-detected pass/fail (`TrainPage.tsx:109`
  `reveal.result.verdict !== 'incorrect'`).
- `correctSegments: DiffSegment[]` where `DiffSegment = { text: string; highlight: boolean }`.
  Rendered at `AnswerReveal.tsx:31-33` — `highlight` → `<mark>`, else `<span>`.

Verdict tiers (`answer-check.ts:27-40`):

1. Exact string match → `correct`, single non-highlighted segment.
2. `normalizeAnswer` equal → `correctWithDifferences`, segments from
   `lenientDiffSegments` (character-level).
3. Otherwise → `incorrect`, segments from `wordDiffSegments` (word-level).

Two distinct diff implementations exist today:

- `lenientDiffSegments` (`answer-check.ts:68-90`) — char-level. Works only
  because the two answers share an identical normalized-letter sequence; it
  aligns letters one-to-one and highlights a letter when its raw form differs
  (accent/case), plus highlights punctuation present in the correct answer but
  missing from the submission.
- `wordDiffSegments` (`answer-check.ts:95-108`) — word-level. Highlights any
  correct-answer word whose normalized form doesn't match the submitted word at
  the **same index**. This is positional only — it cannot align around an
  inserted or deleted word, so a single missing word at the start mis-highlights
  everything after it, and it never represents extra user words at all.

Supporting helpers: `normalizeAnswer` (`:43`), `annotateChars` (`:56`),
`countBy` (`:110`), `toSegments` (`:118`).

### Key Discoveries

- `normalizeAnswer` is used for **grading** (verdict tiers) *and* as the basis
  for `annotateChars`. It must stay — only the **display diff** changes.
  (`answer-check.ts:32-33,43`, `TrainPage.tsx:103`)
- The reveal renderer is a trivial `.map` over segments
  (`AnswerReveal.tsx:31-33`); supporting a third visual state only needs one
  more branch + one CSS rule.
- `.correct-answer mark` styling lives at `client/src/styles.css:424-428`
  (`background:#fde293`). There is **no** strikethrough style yet.
- Unit tests: `client/tests/training/answer-check.test.ts` asserts on
  `highlight: true` segments via a `highlighted()` helper and on `fullText()`
  (the concatenation of all segment text). The flat-segment / `fullText`
  contract is what keeps `¿Cómo estás?` rendering verbatim.
- `diff@9.0.0` is current and ships **native** ESM + CJS `.d.ts` files
  (verified via `npm view diff exports`) — no `@types/diff` needed.
- **Comparator insight that simplifies everything:** if `diffArrays` aligns word
  tokens using a comparator of "normalized forms are equal", then every *common*
  (aligned) token pair is guaranteed to have an identical normalized-letter
  sequence. That is exactly the precondition `lenientDiffSegments` already
  requires. So the existing per-token char-alignment logic can be **reused
  unchanged** for in-word highlighting — **`diffChars` is never needed.**

### E2E impact discovered

`e2e/training.spec.ts:63-67` types `la silla` for correct `la casa` and asserts
`.correct-answer` `toHaveText('la casa')`. Under the new design the reveal will
also render the struck extra word, so the text becomes `la silla casa`. This
assertion **must be updated** (assert the `<mark>` contents / structure instead
of full text). Other reveal assertions to recheck: `:56`, `:103` (exact match —
unchanged), `:127` (`.correct-answer mark` `toHaveText('á')` — still passes).

## Desired End State

`checkAnswer` returns the same `verdict` values (grading unchanged), but
`correctSegments` is produced by a single unified diff that interleaves correct
and extra-submitted content. A new `kind` discriminator replaces the boolean
`highlight`:

```ts
export type SegmentKind = 'unchanged' | 'missing' | 'extra';
export interface DiffSegment {
  text: string;
  kind: SegmentKind;
}
```

- `unchanged` → `<span>` (plain).
- `missing` → `<mark>` (yellow; correct content the user missed, **or** a
  changed char inside an aligned word).
- `extra` → `<mark class="extra">` (yellow + strikethrough; a word the user
  typed that isn't in the correct answer).

`lenientDiffSegments` and `wordDiffSegments` are **deleted** and replaced by one
`diffSegments(submitted, correct)` used by both the `correctWithDifferences` and
`incorrect` paths.

Verify by: unit tests green, the worked example above renders as specified, and
e2e training spec green after its one assertion update.

## What We're NOT Doing

- Not changing grading / verdict logic. `normalizeAnswer` and the three-tier
  verdict decision stay exactly as they are.
- Not using `diffChars` or `diffWords` — `diffArrays` + the existing per-token
  char alignment covers every case (see Key Discoveries).
- Not introducing `Intl.Segmenter` tokenization. Whitespace splitting matches
  current behaviour and all existing tests; revisit only if a real need appears.
- Not touching the server, MCP, or any non-training client code.
- Not changing the "You typed:" line (`AnswerReveal.tsx:24-28`); the inline
  strikethrough intentionally coexists with it per the request.

## Implementation Approach

Keep the verdict decision in `checkAnswer` untouched. Swap the two private diff
functions for one `diffSegments` built on `diffArrays`:

1. Tokenize submitted and correct into **word tokens** by splitting on `/\s+/`
   (drop empties). Punctuation stays attached to its word, exactly as the
   current code treats it.
2. `diffArrays(submittedWords, correctWords, { comparator })` where
   `comparator(a, b) = normalizeWord(a) === normalizeWord(b)` (the per-word
   normalization already implied by `normalizeAnswer`).
3. Walk the diff parts, maintaining indices into both token arrays:
   - **removed** (submitted-only) → emit the word as `extra` segments.
   - **added** (correct-only) → emit the word as `missing` segments.
   - **common** → pair `submittedWords[si]` with `correctWords[ci]` and run the
     existing per-token char alignment to emit `unchanged` / `missing` segments
     (changed char = `missing`).
4. Insert a single `unchanged` space segment between consecutive words, then
   coalesce adjacent same-`kind` segments (generalized `toSegments`). The
   single-space join reproduces existing `fullText` expectations for
   space-separated answers.

`AnswerReveal` renders `missing`/`extra` as `<mark>` (extra gets a class), and
the test helpers switch from `highlight` to `kind`.

## Phase 1: Add the `diff` dependency

### Overview

Install jsdiff into the client workspace.

### Changes Required

**File**: `client/package.json`
**Changes**: add `"diff": "^9.0.0"` to `dependencies`.

Run from repo root:

```bash
pnpm --filter @spanish-cards/client add diff
```

### Success Criteria

#### Automated Verification
- [x] `diff` resolves and types load: `pnpm --filter @spanish-cards/client typecheck`
- [x] Lockfile updated: `git diff --stat pnpm-lock.yaml` shows the change

#### Manual Verification
- [x] `client/package.json` lists `diff` under `dependencies` (not dev), no
      `@types/diff` added.

---

## Phase 2: Rewrite the diff in `answer-check.ts`

### Overview

Replace the segment model and the two diff functions with a single
`diffArrays`-based implementation. Keep `normalizeAnswer`, `annotateChars`, the
verdict tiers, and `countBy` intact.

### Changes Required

#### 1. Segment model

**File**: `client/src/training/answer-check.ts`
**Changes**: replace `DiffSegment` with the `kind` discriminator.

```ts
export type SegmentKind = 'unchanged' | 'missing' | 'extra';

export interface DiffSegment {
  text: string;
  kind: SegmentKind;
}
```

#### 2. Imports

**File**: `client/src/training/answer-check.ts` (top of file, per import convention)

```ts
import { diffArrays } from 'diff';
```

#### 3. `checkAnswer` wiring

Keep the three-tier verdict decision. Both non-exact tiers now call the same
`diffSegments`:

```ts
export function checkAnswer(submitted: string, correctAnswer: string): AnswerCheckResult {
  const correct = correctAnswer.trim();
  if (submitted.trim() === correct) {
    return { verdict: 'correct', correctSegments: [{ text: correct, kind: 'unchanged' }] };
  }
  const normalizedSubmitted = normalizeAnswer(submitted);
  const verdict: Verdict =
    normalizedSubmitted !== '' && normalizedSubmitted === normalizeAnswer(correct)
      ? 'correctWithDifferences'
      : 'incorrect';
  return { verdict, correctSegments: diffSegments(submitted, correct) };
}
```

#### 4. Replace `lenientDiffSegments` + `wordDiffSegments` with `diffSegments`

Delete both functions. Add:

```ts
// Normalized form of a single word token (no internal spaces expected).
function normalizeWord(word: string): string {
  return annotateChars(word).map((c) => c.norm ?? '').join('');
}

// Unified token-level diff. Word tokens are aligned with jsdiff's diffArrays
// using a normalization-aware comparator, so `excursion` aligns with
// `excursión` and a missing/extra word shifts alignment instead of cascading.
// Aligned (common) word pairs share an identical normalized-letter sequence, so
// inWordSegments can reuse the existing letter-alignment to highlight only the
// differing characters.
function diffSegments(submitted: string, correct: string): DiffSegment[] {
  const submittedWords = submitted.trim().split(/\s+/).filter((w) => w !== '');
  const correctWords = correct.trim().split(/\s+/).filter((w) => w !== '');

  const parts = diffArrays(submittedWords, correctWords, {
    comparator: (a, b) => normalizeWord(a) === normalizeWord(b),
  });

  const segments: DiffSegment[] = [];
  let si = 0;
  let ci = 0;
  let needsSpace = false;
  const pushWord = (wordSegments: DiffSegment[]) => {
    if (needsSpace) segments.push({ text: ' ', kind: 'unchanged' });
    segments.push(...wordSegments);
    needsSpace = true;
  };

  for (const part of parts) {
    if (part.removed) {
      // Submitted-only words: extra, struck through.
      part.value.forEach((word) => pushWord([{ text: word, kind: 'extra' }]));
      si += part.value.length;
    } else if (part.added) {
      // Correct-only words the user missed.
      part.value.forEach((word) => pushWord([{ text: word, kind: 'missing' }]));
      ci += part.value.length;
    } else {
      // Aligned words: char-level diff inside each.
      part.value.forEach((_, k) => {
        pushWord(inWordSegments(submittedWords[si + k], correctWords[ci + k]));
      });
      si += part.value.length;
      ci += part.value.length;
    }
  }

  return coalesce(segments);
}
```

#### 5. In-word char diff (reuse of existing alignment)

This is `lenientDiffSegments` re-scoped to a single aligned word pair. Because
the comparator guarantees equal normalized letters, the one-to-one letter
alignment is valid. Changed letters and missing punctuation become `missing`.

```ts
function inWordSegments(submitted: string, correct: string): DiffSegment[] {
  const correctChars = annotateChars(correct);
  const submittedChars = annotateChars(submitted);
  const submittedLetters = submittedChars.filter((c) => c.norm !== null);
  const availablePunctuation = countBy(
    submittedChars.filter((c) => c.norm === null && c.raw.trim() !== '').map((c) => c.raw),
  );

  let letterIndex = 0;
  return coalesceChars(
    correctChars.map((c) => {
      if (c.norm !== null) {
        const changed = c.raw.toLowerCase() !== submittedLetters[letterIndex++]?.raw.toLowerCase();
        return { text: c.raw, kind: changed ? 'missing' : 'unchanged' };
      }
      // Punctuation: highlight only if the user didn't supply it.
      const available = availablePunctuation.get(c.raw) ?? 0;
      availablePunctuation.set(c.raw, available - 1);
      return { text: c.raw, kind: available > 0 ? 'unchanged' : 'missing' };
    }),
  );
}
```

#### 6. Coalescing helpers

Generalize `toSegments` to merge by `kind`. One helper merges a `DiffSegment[]`
(used at word and final level); reuse it for chars too:

```ts
function coalesce(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    if (seg.text === '') continue;
    const last = out[out.length - 1];
    if (last && last.kind === seg.kind) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}
```

(`coalesceChars` above is just `coalesce`; collapse to one helper. Delete the
old `toSegments`.)

> Note: `annotateChars`, `normalizeAnswer`, `countBy`, `Verdict`,
> `AnswerCheckResult` are unchanged. Only `DiffSegment`, `checkAnswer`'s tail,
> and the diff functions change.

### Success Criteria

#### Automated Verification
- [x] Type checking passes: `pnpm --filter @spanish-cards/client typecheck`
- [x] Unit tests pass (after Phase 4): `pnpm --filter @spanish-cards/client test`

#### Manual Verification
- [ ] The worked example renders `Fuimos [a hacer] una pequeña [de](struck) excursión(ó) y [nos] perdimos.`

---

## Phase 3: Render the three states

### Overview

Teach `AnswerReveal` and the stylesheet about `extra` (strikethrough).

### Changes Required

#### 1. Renderer

**File**: `client/src/training/AnswerReveal.tsx:31-33`
**Changes**: branch on `kind` instead of `highlight`.

```tsx
{correctSegments.map((segment, i) => {
  if (segment.kind === 'unchanged') return <span key={i}>{segment.text}</span>;
  const className = segment.kind === 'extra' ? 'extra' : undefined;
  return <mark key={i} className={className}>{segment.text}</mark>;
})}
```

#### 2. Stylesheet

**File**: `client/src/styles.css` (after `:424-428`)

```css
.correct-answer mark.extra {
  text-decoration: line-through;
  text-decoration-thickness: 2px;
}
```

### Success Criteria

#### Automated Verification
- [x] Type checking passes: `pnpm --filter @spanish-cards/client typecheck`

#### Manual Verification
- [ ] Extra user words show yellow background **and** strikethrough.
- [ ] Missing words and changed chars show yellow background, no strikethrough.
- [ ] Reveal layout is stable / unchanged for an exact-match answer.

---

## Phase 4: Update tests

### Overview

Migrate unit tests from `highlight` to `kind`; add coverage for the new
extra-word and word-alignment behaviour; fix the one e2e assertion.

### Changes Required

#### 1. Unit tests

**File**: `client/tests/training/answer-check.test.ts`
**Changes**:

- Replace the `highlighted()` helper:
  ```ts
  const missing = (s: DiffSegment[]) => s.filter((x) => x.kind === 'missing').map((x) => x.text);
  const extra = (s: DiffSegment[]) => s.filter((x) => x.kind === 'extra').map((x) => x.text);
  ```
- Update existing expectations to `missing(...)` (verdict values are unchanged;
  `fullText` for the `correctWithDifferences` cases is unchanged).
- Update `'el perro'` vs `'el gato'`: `missing` `['gato']`, `extra` `['perro']`.
- Add the worked-example case asserting `missing` ⊇ `['a','hacer','nos']`,
  `extra` `['de']`, and that `excursión` highlights only `ó`.
- Add a "missing word at the start shifts alignment correctly" case
  (`'días'` vs `'buenos días'` → `missing` `['buenos']`, not the whole string),
  which the old positional `wordDiffSegments` got wrong.

#### 2. E2E

**File**: `e2e/training.spec.ts:67`
**Changes**: the `la silla` / `la casa` case — replace
`toHaveText('la casa')` with structure-aware assertions, e.g.
`.correct-answer mark` (non-extra) contains `casa` and `.correct-answer mark.extra`
contains `silla`. Leave `:56`, `:103`, `:127` as-is.

### Success Criteria

#### Automated Verification
- [x] Unit tests pass: `pnpm --filter @spanish-cards/client test`
- [x] Full client checks: `pnpm --filter @spanish-cards/client typecheck`
- [x] E2E training spec passes: `pnpm e2e` (or the training spec specifically)

#### Manual Verification
- [ ] No regression in the reveal for correct, correctWithDifferences, and
      incorrect answers during a real training session.

---

## Testing Strategy

### Unit Tests
- Verdict tiers unchanged: exact / accent-only / wrong-word still map to
  `correct` / `correctWithDifferences` / `incorrect`.
- In-word char highlighting: `ó`, `á`, `ñ`→`n`, case, missing/inverted
  punctuation (existing cases, re-expressed via `kind`).
- Word alignment: inserted correct word (`missing`), extra submitted word
  (`extra`), reordering, leading missing word (regression vs old positional
  diff).
- `fullText` of `correctWithDifferences` reveals stays verbatim.

### Manual Testing Steps
1. Train a card; type the worked-example sentence; confirm the rendered reveal
   matches the spec (struck `de`, highlighted `a hacer` / `nos` / `ó`).
2. Type an exact answer → no highlights, stable layout.
3. Type an extra trailing word → it appears struck through inline.

## Performance Considerations

Diff runs once per answer reveal over short strings (a flashcard answer);
`diffArrays` is O(n·d) on token counts in the single digits. Negligible.

## Migration Notes

`DiffSegment.highlight` → `DiffSegment.kind` is an internal client-only type;
the only consumers are `AnswerReveal.tsx` and the unit test, both updated here.
No persisted data, API, or server contract is affected.

## References

- Current implementation: `client/src/training/answer-check.ts`
- Renderer: `client/src/training/AnswerReveal.tsx:31-33`
- Styles: `client/src/styles.css:424-428`
- Unit tests: `client/tests/training/answer-check.test.ts`
- E2E impact: `e2e/training.spec.ts:63-67`
- Library: `diff@9.0.0` (jsdiff), `diffArrays` with custom comparator
