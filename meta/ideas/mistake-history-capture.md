# Mistake History Capture

## Summary

Today the app computes a word-level diff between what the user typed and the correct
answer purely to render the highlighted reveal screen, then discards it — only a
boolean ("was this correct") is ever persisted. This idea adds a new, fully
independent `review_history` table that durably captures every training attempt
(the correct phrase, what the user actually typed, the verdict, direction, and
rating) so that a future data-analysis feature can mine it for the user's
recurring problem areas. This phase is storage only — no analysis, dashboard, or
UI is included.

## Problem

The user trains against Spanish/English flashcards repeatedly over weeks and
months. The app already knows, moment-to-moment, exactly which words or letters
were wrong on every attempt (that's what powers the highlight/strikethrough on
the reveal screen) — but it throws that information away immediately after
rendering it. The only durable record of an attempt is a single boolean
(`detected_correct`) on the existing `reviews` table. As a result, there is no
way to later ask "what kinds of mistakes do I keep making" or "which words/areas
should I study" — the raw material for that analysis doesn't exist anywhere.

## Goals

- Durably capture, for every training attempt, enough raw information to later
  reconstruct what was right and wrong about it.
- Make the captured data self-contained: usable for analysis without joining
  against `cards` or `reviews`, and unaffected by future edits or deletions of
  either.
- Keep this phase scoped to data capture only — no analysis logic, no UI, no
  dashboard.
- Avoid changing or risking the existing training/scheduling flow
  (`cards`, `card_schedules`, `reviews`) in the process.

## Non-Goals

- No data analysis, aggregation, or "what to study" logic in this phase.
- No UI or dashboard changes.
- No word-level mistake extraction or categorization (e.g. tagging a specific
  wrong word as "verb conjugation error") at write time — full correct/submitted
  phrases are captured instead, and any word-level or category-level analysis is
  deferred entirely to a later analysis phase, which can re-derive it from the
  stored phrases.
- No retention/cleanup automation in this phase (manual deletion by timestamp is
  a deliberately supported *future* capability, not built now).
- No server-side move of the live diff/highlight computation that powers the
  reveal screen — that stays client-side and unchanged.

## Users and Stakeholders

Single user of this app (the same person studying Spanish/English). No other
stakeholders — this is a personal learning tool. The "stakeholder" benefiting
from this phase is the user's own future self, via a later analysis feature
built on top of this captured data.

## Core Workflow

1. User trains as they do today: shown a prompt (Spanish or English, per
   `direction`), types an answer, sees the highlighted reveal, and rates their
   recall (`again`/`hard`/`good`/`easy`).
2. In addition to today's existing scheduling/review submission, the exact text
   the user typed is sent to the server alongside the existing review payload.
3. The server resolves the correct phrase for that card/direction at that
   moment (from the live `cards` row) and writes one row to `review_history`
   containing: the correct phrase, the submitted phrase, the verdict, the
   direction, the rating, and a timestamp — independent of `cards` and
   `reviews`.
4. This happens silently, every time, with no visible change to the training
   experience. Over days/weeks, `review_history` accumulates a complete,
   timestamped log of every attempt, ready for a future analysis feature to
   query.

## Functional Requirements

- Every answered card produces exactly one `review_history` row, including
  attempts the user got fully correct (full data consistency — even
  "correct-with-differences" cases where the user technically passed but the
  text wasn't a byte-for-byte match are valuable signal).
- Each row independently stores:
  - The full correct phrase, as it existed at the moment of the attempt.
  - The full phrase the user actually typed/submitted.
  - The verdict, preserving the existing three-state distinction
    (`correct` / `correctWithDifferences` / `incorrect`) rather than
    collapsing to a boolean — `correctWithDifferences` (e.g. accent/case-only
    slips) is exactly the kind of pattern this feature exists to surface later.
  - The training direction (`spanish-to-english` / `english-to-spanish`), so
    "which language was the user producing" can later be analyzed separately.
  - The rating (`again`/`hard`/`good`/`easy`) given for that attempt.
  - A timestamp of when the attempt was made.
  - A reference to the originating card (informational only — see Business
    Rules).
- The capture must not block, slow down, or risk the existing answer-reveal or
  scheduling flow (`card_schedules` update, `reviews` insert). If anything, it
  should be addable as a parallel write within the same submission.
- The raw submitted text the user types must reach the server at all — today it
  never does. This requires the existing review-submission API to carry the
  user's typed text in its payload.

## Business Rules

- `review_history` has **no foreign key constraints** to `cards` or `reviews`.
  The card reference is stored as a plain, unenforced identifier for
  informational/debugging convenience only. This is a deliberate choice: every
  field needed for analysis is snapshotted directly onto the row, so the table
  has zero referential dependency on the rest of the schema.
- Consequently, deleting a card, deleting its schedule, or deleting its
  `reviews` rows must have **no effect whatsoever** on previously captured
  `review_history` rows.
- Conversely, deleting or modifying `review_history` rows (e.g. future manual
  pruning by timestamp) must have **no effect** on `cards`, `card_schedules`,
  or `reviews`.
- `review_history` is written to, but never read from, by the existing
  training/scheduling code paths. It is a write-only side effect from the
  application's perspective in this phase; a future analysis feature is the
  only intended reader.
- The correct phrase captured is whatever the card's text was *at the moment of
  the attempt* — since cards have no edit capability today, this is currently
  equivalent to the live card text, but the snapshot is taken to guarantee
  correctness even if card editing is introduced later.

## Edge Cases and Failure Scenarios

- **Card deleted after attempts were logged**: `review_history` rows persist
  unaffected; the stored `card_id` becomes a dangling, non-enforced reference.
  This is expected and acceptable.
- **Card text changes in the future** (no edit capability exists today, but
  is plausible later): historical `review_history` rows are unaffected because
  the correct phrase was snapshotted at write time, not joined live.
- **Perfect/correct attempts**: still produce a `review_history` row with
  identical (or near-identical) correct/submitted text — intentionally
  retained for a complete denominator and to catch "correct but with ignored
  differences" cases.
- **Write failure for the history row**: should not be allowed to fail or roll
  back the existing scheduling/review write — this is supplementary data, not
  on the critical path of the training experience. (Exact transactional
  boundaries are an implementation decision for the later plan, but the
  product intent is: history capture is best-effort relative to the core
  training flow, not the other way around.)
- **Very long submitted text**: the user could in theory type something far
  longer than a normal answer; storage should not silently truncate in a way
  that corrupts analysis later (existing `cards` text columns are capped at
  varchar(70); submitted text has no such natural cap today since it's never
  been persisted before).

## Success Criteria

### User or Business Success

- After some period of normal daily training, the user can confirm (e.g. via a
  direct database query) that every attempt they made is present in
  `review_history` with correct and submitted text intact.
- The user can delete or edit cards/reviews data without any observed change to
  previously captured history rows.

### Product Acceptance

- The existing training flow (prompt → type answer → see highlighted reveal →
  rate → next card) behaves identically to today from the user's perspective —
  no visible latency, UI change, or behavior change.
- Every submitted review produces exactly one new `review_history` row.
- `review_history` rows contain no foreign key relationship to `cards` or
  `reviews` at the database level.
- A row's verdict preserves the three-state distinction
  (correct/correctWithDifferences/incorrect), not just a boolean.

## High-Level Technical Guidance

- The existing review-submission flow already carries `cardId`, `direction`,
  `rating`, and `detectedCorrect` from client to server; this phase's main
  contract change is adding the user's raw submitted text to that same
  payload, so the server can resolve and snapshot the correct phrase itself
  (it already has access to the live card record and knows the direction).
- The existing client-side diff/highlight computation
  (`client/src/training/answer-check.ts`) is left entirely as-is — it continues
  to serve only the instant on-screen reveal. Nothing about this feature
  requires moving that computation server-side, and doing so would add a
  round-trip to the reveal flow for no benefit.
- `review_history` is best modeled as a new, standalone table — not as
  additional columns on `reviews` — specifically because the design intent is
  decoupling: `reviews` remains the lean, operational table read by the live
  scheduling logic and the existing progress dashboard, while `review_history`
  is a separate, append-only analytical log that nothing else in the
  application depends on.
- Because there are no foreign key constraints, this table can be safely
  excluded from any future `ON DELETE CASCADE` chains rooted at `cards`, and
  can itself be pruned by timestamp later without any cross-table cleanup
  logic.

## Risks and Trade-Offs

- **Storage duplication is intentional.** Correct text, direction, and rating
  already exist elsewhere (`cards`, `reviews`) and will now be duplicated into
  `review_history` on every attempt. This is an accepted trade-off in exchange
  for true independence — the alternative (foreign keys back to live tables)
  would reintroduce exactly the coupling this feature is meant to avoid.
- **No word-level mistake data at write time.** Storing only full correct and
  submitted phrases means a later analysis feature must (re-)implement its own
  word-level diffing to find specific mistakes, rather than reading
  pre-computed mistake records. This is accepted because: (a) the existing
  diff's missing/extra segment alignment isn't a reliable 1:1 word
  correspondence when lengths differ, so committing to that alignment at write
  time would bake in ambiguity; and (b) storing full phrases is strictly more
  flexible — any word-level extraction can be (re)computed from the raw text
  later, using the current algorithm or an improved one, but the reverse is
  not true.
- **Unbounded growth.** With no retention policy in this phase, the table
  grows indefinitely. Accepted for now since this is a single-user app and
  manual, timestamp-based pruning is explicitly a supported future option, not
  a current requirement.
- **Submitted text has no length cap today.** Unlike `cards.spanish_text`/
  `english_text` (capped at varchar(70)), free-typed submissions have never
  been persisted before and have no established size constraint. A reasonable
  cap should be chosen during implementation, generous enough to never
  truncate legitimate answers.

## Assumptions

- Cards cannot be edited today (confirmed: only create and delete routes
  exist), so the "snapshot protects against edits" rationale is forward-looking
  rather than addressing a live gap — but cheap enough to do now regardless.
- A "review" and an "attempt" are equivalent in today's flow — there is no
  retry-before-rating step that would produce multiple attempts per reveal.
  If that ever changes, this idea's "one row per submission" assumption should
  be revisited.
- The single existing review-submission API call is the right place to add the
  new data, rather than introducing a separate endpoint — this keeps the
  capture atomic with the action it describes.

## Future Considerations

- A data-analysis page/feature that reads `review_history` exclusively to
  surface recurring problem areas, trends over time, or category-level
  weaknesses (verb conjugation, gender agreement, accents, vocabulary, etc.).
- Word/segment-level mistake extraction, computed from the stored full phrases
  rather than at write time — likely as a derived/cached enrichment built on
  top of `review_history`, not a replacement for it.
- Manual or scheduled pruning of old `review_history` rows by timestamp.
- Revisiting whether `language_pair` (currently unused beyond a default value
  on `cards`) should factor into history analysis if multiple language pairs
  are ever supported.
