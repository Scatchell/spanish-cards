# Epic 02: Typed Training and FSRS Scheduling

## Implementation Prompt

Build the second vertical slice of the Spanish flashcard app: an end-to-end training experience powered by typed answers and FSRS scheduling. The user should be able to start training, receive due cards oldest-first, type an answer, see the correct answer, and record scheduling feedback. This slice should make the app useful as an actual study tool.

This prompt is self-contained. Assume the application is a single-user, authenticated, mobile-responsive TypeScript web app backed by PostgreSQL. There is one deck of flashcards. Cards have Spanish text, English text, creation/update timestamps, and can be created/deleted. If the existing implementation differs, adapt minimally while preserving these requirements.

## Core Goals

- Add a `Train` flow available to the authenticated user.
- Use FSRS scheduling, preferably via `ts-fsrs` or an equivalent well-maintained library.
- Newly created cards should be immediately due for training.
- Due cards should be shown oldest-due-first.
- User types an answer, and the app checks it with deterministic lenient matching.
- The correct answer is always shown after submission, even when the user was correct.
- Correct answers allow user rating with `Hard`, `Good`, or `Easy`.
- Incorrect or empty answers default to `Don't remember`/`Again`, but the user can override to `Hard`, `Good`, or `Easy` after seeing the answer.
- Persist FSRS state so future sessions show the correct due cards.
- Support training direction toggle: Spanish prompt -> English answer, or English prompt -> Spanish answer.

## Data and Scheduling Requirements

Extend the data model as needed to support FSRS. Store enough per-card scheduling state to correctly calculate:

- Due date/time.
- Stability/difficulty or equivalent FSRS fields.
- Repetition/review count if required by the library.
- Lapse count if required by the library.
- Last reviewed timestamp.
- Current scheduling state/status if required.

Guidance:

- Use `ts-fsrs` unless incompatible with the chosen stack.
- Use default FSRS parameters unless there is a strong reason to configure them.
- Calculate due cards using local application time consistently.
- New cards should be initialized so they are immediately trainable.
- Rating a card must update its persisted FSRS state.
- If a card is deleted, any scheduling data for it should also be deleted.

Every schema change must use migrations with explicit rollback/down migrations.

## Training Flow UX

The authenticated user can click `Train` from the app shell/card page.

Default flow:

- Load due cards oldest-due-first.
- Show one card at a time.
- Default direction is Spanish prompt, English answer.
- Include a direction toggle for English prompt, Spanish answer.
- Direction preference should persist for the browser session.
- Show a single-line answer input.
- User submits with `Enter`.
- If input is empty and user presses `Enter`, treat it as `Don't remember` and reveal the correct answer.
- Always reveal the correct answer after submission.
- If detected correct, show a success state and rating buttons: `Hard`, `Good`, `Easy`.
- If detected incorrect, show an incorrect state, the user's answer, the correct answer, and rating buttons: `Don't remember`, `Hard`, `Good`, `Easy`.
- The default/emphasized action for incorrect/empty answer should be `Don't remember`.
- After rating, persist the schedule update and move to the next card.
- If there are no more due cards, show a congratulations/done screen.

Keyboard shortcuts:

- `Enter` submits the typed answer while answering.
- Rating shortcuts should work only after answer reveal.
- Use `0 = Don't remember`, `1 = Hard`, `2 = Good`, `3 = Easy`.
- Do not allow `0` for detected-correct answers unless the user changes/overrides the correctness state through an explicit UI affordance.
- Ensure shortcuts do not trigger while the user is typing in unrelated controls.

Mobile requirements:

- The training interface must be comfortable on phone screens.
- Rating controls must be large enough for touch.
- The correct answer and difference highlights must remain readable on small screens.

## Answer Checking Requirements

Training direction controls which field is checked:

- Spanish prompt -> typed answer checked against English text.
- English prompt -> typed answer checked against Spanish text.

Use deterministic matching for MVP. The goal is to check whether the user remembered the word/phrase, not whether they typed perfectly.

Treat these as correct but highlight differences:

- Accent/diacritic mistakes.
- Capitalization differences.
- Punctuation differences.
- Inverted Spanish punctuation differences.
- Extra or repeated spaces.
- Small stray characters that normalization can safely ignore.

Phrase matching:

- Require word-for-word match after normalization for now.
- Word order should matter.
- Do not use semantic equivalence or translation APIs.

After answer reveal:

- Show the submitted answer and correct answer.
- Highlight differences in a user-helpful way, especially missing/wrong accents.
- If detected as correct only because of lenient normalization, communicate that it counted as correct but had small differences.
- If detected as incorrect, allow the user to override by choosing `Hard`, `Good`, or `Easy` if they believe they remembered it correctly despite the typed mismatch.

## Continue Studying

When the user reaches the done/congratulations screen:

- Show that scheduled cards are complete.
- Include an option to continue studying ahead of schedule.
- Continuing should load the next soonest cards even if not due.
- Ahead-of-schedule study should update FSRS normally when rated.
- Keep the UI clear that these are extra practice cards rather than scheduled due cards.

This can be implemented in this epic if complexity allows. If necessary to balance the slice, implement the core due-card FSRS flow first and leave richer continue-studying polish to Epic 03, but the data model should not prevent it.

## Architecture Expectations

- Keep answer-normalization/matching logic in a domain module with direct unit tests.
- Keep FSRS scheduling decisions in a domain/service module with direct unit tests.
- UI components should call clear application actions rather than embedding scheduling logic directly.
- Avoid adding multi-deck or multi-user abstractions.
- Keep imports at the top of files.

## Testing Requirements

Include useful tests for core behavior.

Minimum expected coverage:

- Unit tests for answer normalization and matching.
- Unit tests for accent/case/punctuation/spacing leniency.
- Unit tests proving word order matters for phrases.
- Unit tests or integration tests proving rating updates due dates/state.
- Integration test for loading due cards oldest-first.
- E2E/smoke test for training one due card from typed answer through rating.
- E2E/smoke test for empty answer showing correct answer and defaulting to `Don't remember`.

## Acceptance Criteria

- Newly created cards are immediately available in training.
- Due cards are presented oldest-due-first.
- User can train Spanish -> English and English -> Spanish.
- Direction toggle persists for the browser session.
- Empty answer reveals the correct answer and defaults to `Don't remember`.
- Correct typed answer reveals correct answer and offers `Hard`, `Good`, `Easy`.
- Incorrect typed answer reveals correct answer and offers `Don't remember`, `Hard`, `Good`, `Easy`.
- Lenient correctness handles accents, casing, punctuation, inverted punctuation, and spacing.
- FSRS state persists and affects what is due on later visits.
- Done screen appears when scheduled due cards are complete.
- Tests cover the meaningful domain logic.

## Out of Scope

- Multiple decks.
- User accounts beyond the single authenticated user.
- AI/LLM answer judging.
- Semantic translation matching.
- Card editing.
- Rich progress dashboard, unless needed as minimal counts for the training page.
