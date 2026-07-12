# Rating-Based Correct-Rate Stat

## Summary

Change the meaning of the "correct rate" stat (shown on the progress dashboard and as the in-session running tally) so it reflects the user's own final self-rating — Again means incorrect, Hard/Good/Easy mean correct — instead of the deterministic answer checker's verdict at submission time. This reverses a currently intentional, documented design choice, on the grounds that the checker's verdict is not a reliable proxy for "did the user actually know it," especially since the checker cannot recognize valid alternate translations.

## Problem

Today, `detected_correct` (the field driving the correct-rate stat) is computed purely from the answer-checker's verdict (`verdict !== 'incorrect'`) at the moment the user submits their typed answer — before they ever pick a self-rating. The README documents this as intentional: it's meant to stop a manual "Good" override on a missed answer from inflating the stat.

In practice, this means a user who types a genuinely valid alternate translation (which the checker can't recognize — see `explain-answer-checking.md`) is permanently counted as "incorrect" for stats purposes, even though they knew the answer and rated themselves accordingly. Conversely, the stat's own documented rationale — protecting against inflation from casual overrides — assumes the override is suspect, when in practice the self-rating (specifically the choice to rate "Again" or not) is the user's own honest judgment of whether they knew the material, which is the entire signal FSRS scheduling already trusts for every other purpose. The checker verdict is a UI/highlighting aid, not a ground-truth recall signal, and this idea aligns the stat with what the user actually asserts about their own recall.

## Goals

- Make the persisted "correct rate" stat (progress dashboard) reflect the user's final self-rating rather than the answer checker's verdict.
- Apply the same fix to the in-session running "correct" tally shown on the session-complete screen, which has the identical issue (computed client-side from the checker verdict before rating is chosen).
- Recompute historical stats under the new definition so the trend chart has no discontinuity at a cutover point.

## Non-Goals

- Do not change the deterministic answer checker (`checkAnswer`) itself, or the reveal-screen highlighting it powers.
- Do not change what verdict/rating values are stored on the `reviews` table — both `detected_correct` and `rating` already exist on every row; this idea only changes which one the stat calculation reads.
- Do not change the `review_history` table or its capture logic — it already stores both the checker verdict and the final rating independently per attempt (for every attempt, not just incorrect ones), so it is unaffected by and unrelated to this change.
- Do not change FSRS scheduling behavior — scheduling already uses `rating` exclusively and is untouched.
- Do not build any new UI for toggling between "checker-based" and "rating-based" views of the stat — this idea fully replaces the definition, it doesn't add a mode switch.
- Do not address the `explain-answer-checking.md` idea's own scope (LLM-assisted answer checking) — that idea explicitly deferred this stats question to this one.

## Users and Stakeholders

Single user of this app, studying Spanish/English flashcards. This idea affects only how their own historical performance is summarized back to them on the progress dashboard and session-complete screen; there are no other stakeholders.

## Core Workflow

1. User trains as today: sees a prompt, types an answer, the checker computes a verdict for reveal/highlighting purposes only, and the user picks a self-rating (Again/Hard/Good/Easy).
2. The review is submitted and persisted as today (both `detected_correct` and `rating` continue to be stored on the `reviews` row, unchanged).
3. Wherever a "correct" count is derived for stats purposes — the server-side progress metrics computation, and the client-side in-session tally — the definition changes from "checker verdict was not incorrect" to "final rating was not Again."
4. The progress dashboard's correct-rate figures (today's rate, daily trend, average) and the session-complete screen's running tally both reflect this new definition, including for historical data already in the database.

## Functional Requirements

- The server-side progress metrics computation must derive "correct" from `rating != 'again'` instead of `detected_correct`, for every stat currently built from `detected_correct` (today's correct rate, per-day buckets, average daily correct rate).
- The client-side in-session tally must be updated at the point the user picks a rating (not at answer-submission time, since rating isn't known yet), using the same `rating != 'again'` rule.
- Historical review rows must be recomputed/reinterpreted under the new rule so the progress dashboard's trend chart shows one consistent definition across all time, with no visible jump at a cutover date.
- The existing three-state checker verdict (`correct`/`correctWithDifferences`/`incorrect`) continues to be computed, submitted, and stored on `reviews.detected_correct` exactly as today — it remains available for the reveal/highlighting UI and for `review_history`, it is simply no longer read when computing the correct-rate stat.

## Business Rules

- "Correct," for stats purposes, means the review's stored `rating` is `hard`, `good`, or `easy`. "Incorrect" means `rating` is `again`. The checker verdict plays no role in this determination.
- This applies uniformly to both the persisted dashboard stat and the in-session tally — the two must not diverge in definition.
- Because `rating` is already a `NOT NULL` column on every existing `reviews` row, no new data collection is required to apply this rule to historical rows.

## Edge Cases and Failure Scenarios

- A user types a wrong answer, the checker flags it `incorrect`, but the user honestly rates `Good` because they actually knew it (e.g. they made a typo, or gave a valid alternate translation): this now correctly counts as "correct" for stats, which is the explicit intent of this change.
- A user types a right answer, the checker flags it `correct`, but the user still rates `Again` (e.g. they guessed, or want to force extra practice): this now correctly counts as "incorrect" for stats, since the user's own judgment is what's trusted.
- Historical rows: since `rating` was already required and stored on every row, recomputation is a read-time/query-time change (or a one-time backfill of a derived value), not a backfill requiring new source data.
- Any future feature reading `detected_correct` for a purpose other than the correct-rate stat (e.g. `review_history` analysis, or the reveal-screen highlight) is unaffected, since that column and its computation are untouched.

## Success Criteria

### User or Business Success

- The progress dashboard's correct-rate reflects how well the user believes they're actually recalling cards, not how literally their typed text matched the stored answer.
- The session-complete tally and the dashboard stat agree in definition.
- The historical trend chart reads consistently across the entire history, with no artificial jump from a definition change.

### Product Acceptance

- `correctRateToday`, `averageDailyCorrectRate`, and per-day correct counts on `/api/progress` are computed from `rating`, not `detected_correct`.
- The in-session running "correct" tally on the session-complete screen is computed from `rating`, not the checker verdict, and matches what the same reviews would show on the dashboard.
- Querying historical review data reflects the new rating-based definition, not the old checker-verdict-based one.
- The README's documented stat semantics are updated to describe the new rule and drop the now-inaccurate "checker verdict before manual override" description.

## High-Level Technical Guidance

- The natural point of change is the progress-metrics computation (`server/src/progress/metrics.ts` and its data source in `server/src/progress/repository.ts`), swapping the field read from `detected_correct` to `rating` (with `rating != 'again'` as the correctness predicate) — this is a query/computation change, not a schema change, since both columns already coexist on every row.
- The in-session tally is currently computed and recorded at answer-submission time using the checker verdict; this idea requires that determination to move to whenever the rating is chosen, since rating isn't known until then.
- Since no new columns are needed, "recomputing historical stats" is more naturally a case of changing what the read-side query/computation does, rather than a data migration — though the implementation planner should confirm whether any stat values are pre-aggregated/cached anywhere (as opposed to computed on read) since that would change the picture.
- The README's progress-metrics documentation should be updated alongside the code change to keep documented behavior accurate.

## Risks and Trade-Offs

- This is a deliberate reversal of a previously intentional design decision (preventing override-inflation of the stat). The trade-off accepted here: trusting the user's own self-rating as the ground truth for "did I know it" is judged more accurate and more useful than trusting a text-matching heuristic, even though it means a user could inflate their own stat by rating generously — this is accepted because the app is single-user and the stat's purpose is self-insight, not any external accountability.
- Because `detected_correct` and `rating` can diverge, historical review rows previously counted as "correct" under the old rule may now count as "incorrect," and vice versa — the recomputation will visibly change past-reported figures, which is intended but worth the user being aware of before it ships (their memory of "past" dashboard numbers will not match the new numbers if they look at old date ranges again).

## Assumptions

- Progress stats are computed on read from the `reviews` table (per the existing `getAllReviews`/`computeReviewMetrics` pattern) rather than pre-aggregated/cached at write time, so no backfill migration is required beyond changing the computation itself — the implementation planner should verify this assumption holds.
- `review_history`'s independent capture of both verdict and rating per attempt is sufficient for any future "why did the checker and my rating disagree" analysis, so no additional signal needs to be added to `reviews` itself to support that curiosity.

## Future Considerations

- If it later proves useful to see, alongside the correct-rate stat, how often the checker's verdict disagreed with the user's final rating (a proxy for "how often does the checker mislabel valid answers"), that comparison could be built as a separate, explicitly-labeled metric using `review_history`'s already-captured verdict+rating pairs — not folded back into the primary correct-rate stat.
