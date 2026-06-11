# Epic 05: Learning Mode

## Implementation Prompt

Build the fifth vertical slice of the Spanish flashcard app: a non-scheduled learning mode that lets the authenticated user preview, select, and cycle through cards before entering normal FSRS training. This mode should help the user become familiar with new or selected cards without recording reviews, changing due dates, or affecting progress metrics.

This prompt is self-contained. Assume the application is a single-user, authenticated, mobile-responsive Spanish/English flashcard app backed by PostgreSQL. The user can create/delete cards, view due status, train due cards through typed answers with FSRS scheduling, and view progress based on recorded review history. If the existing implementation differs, adapt minimally while preserving the intent of this slice.

## Core Goals

- Add a `Learn` flow available to the authenticated user from the main card page header, positioned to the left of `Train`.
- Let the user choose which cards to include before starting a learning session.
- Select new cards by default, because the primary use case is previewing cards before they enter scheduled training.
- Let the user quickly expand the selected set to include due cards or all cards.
- Show all cards on the selection screen so the user can manually add or remove specific cards before beginning.
- Use a lightweight, ephemeral, client-side learning session with no persistence across refreshes or navigation.
- Keep Learn completely separate from Train: Learn should not call review APIs, update FSRS state, write review history, or affect progress metrics.
- Reuse the existing training card visual language where it helps the app feel coherent, while making the mode clearly non-scheduled and low-pressure.
- Keep the flow comfortable on desktop and mobile.

## Product Intent

Training is the official scheduled review flow. It asks the user to type an answer, reveals correctness, records a rating, updates FSRS state, and contributes to progress history.

Learning is a preview flow. It exists before training and is intentionally non-authoritative. The user can look at both sides of cards, self-mark whether a card has been remembered once in the current pass, and repeat unresolved cards until they feel ready to begin normal training.

The central product rule is that learning must never make a card less available for training. New cards remain due, due cards remain due, future cards remain scheduled for the future, and no progress dashboard numbers change because of learning.

## Entry Point and Navigation

The authenticated card page should expose `Learn` in the app header immediately before `Train`.

Recommended navigation behavior:

- `Learn` opens a dedicated learning selection page.
- `Train` remains the existing scheduled training flow.
- Starting training from the learning done screen navigates to normal training.
- Training does not know anything about Learn, selected learning cards, or prior learning session state.

This separation is important for logical consistency. A user may preview one set of cards, then train whatever is due according to FSRS. Learn is preparation; Train is the source of scheduling truth.

## Card Selection UX

The learning selection screen should show the full deck, with every card visible and selectable.

Default selection behavior:

- New cards are selected by default.
- Reviewed cards that are due now are visible but not selected by default.
- Future-scheduled cards are visible but not selected by default.
- If there are no new cards, the page should still show the deck and make it easy to select due cards or all cards.

Bulk selection actions:

- Include new cards: select the default new-card set.
- Include due cards: select due reviewed cards as well as the currently selected cards.
- Include all cards: select the full deck.
- There should also be an easy way to clear or manually deselect individual cards through the card UI.

Manual selection behavior:

- Each card should be represented using the same card-box style already used in the deck/training UI.
- Each card should have a clickable checkbox or equivalent clear selection affordance.
- Selected cards should have a slightly different visual treatment so the selected learning batch is obvious at a glance.
- The card's Spanish text, English text, and due/review status should be visible to support informed selection.
- The user should not be able to start learning with zero selected cards.

Useful status labels:

- New cards should be labeled as new and due now.
- Due reviewed cards should be labeled as due now.
- Future-scheduled cards should show their next due timing using the app's existing due-status language.

## Learning Session Flow

After the user starts learning, the selected cards become the session's original selected set. The session is held in client state only.

Initial cycle behavior:

- Randomly shuffle the selected cards.
- Show one card at a time.
- Display progress through the current cycle, such as card count or percentage.
- Do not show an answer input.
- Do not show correctness feedback.
- Do not show FSRS rating buttons.
- Do not show scheduled/extra-practice labels from Train, because Learn is neither.

Card display behavior:

- The card should use the established training-card box style.
- The user can freely flip between front and back.
- Flipping is reversible and can happen as many times as the user wants.
- The current prompt direction should be clear.
- A Spanish-to-English / English-to-Spanish direction toggle is useful if it can reuse the existing training preference cleanly, but changing direction in Learn should still have no scheduling effect.

Per-card actions:

- `Remembered`: the user remembered this card once during the current learning pass. Remove it from the current learning queue until the pass is complete.
- `Still learning`: the user wants to see this card again before completing the current pass. Keep it in the current learning queue, but do not show it immediately next.

`Remembered` is preferred over labels such as `Know it` because it describes the local learning action without implying long-term mastery or progress-dashboard meaning.

## Queue Behavior

Learning queue behavior should support light spacing without becoming a second scheduling system.

When the user clicks `Remembered`:

- Remove the current card from the active queue for this cycle.
- Continue to the next card in the active queue.
- The card remains part of the original selected set and can appear again if the user starts another learning pass.

When the user clicks `Still learning`:

- Keep the card in the current active queue.
- Reinsert it near the end of the remaining queue.
- Avoid placing it as the immediate next card.
- Avoid always placing it at the exact end, so repetition does not feel mechanically predictable.
- Keep this behavior simple and client-side; it is not intended to model FSRS or memory science.

When the active queue empties:

- Show a completion state for the learning pass.
- Offer `Keep learning these cards`.
- Offer `Start training`.
- Optionally offer a way back to card selection if that is natural in the implemented layout.

## Restarting a Learning Pass

If the user chooses `Keep learning these cards`, restart with the same original selected set.

Restart behavior:

- Randomly shuffle the original selected set again.
- Track the last 20% of cards from the previous completed pass, with a minimum of 1 card for very small batches.
- Avoid showing those recently seen tail cards at the beginning of the next pass.
- A simple way to satisfy this product behavior is to randomize normally, then move the recent-tail cards toward the end of the new cycle.

The goal is to avoid the frustrating case where the last card from one pass becomes the first card of the next pass. This is a UX smoothing rule, not a scheduling algorithm.

## Data and Persistence Rules

Learning mode should be entirely ephemeral.

Required behavior:

- Do not create or update database rows from learning interactions.
- Do not call the review submission endpoint.
- Do not update FSRS state.
- Do not write review history.
- Do not alter due dates.
- Do not count learning interactions in the progress dashboard.
- Do not persist the selected learning set across refreshes.
- Do not persist learning progress across refreshes.

The existing card-list data is sufficient for the intended MVP selection experience because it includes card text, reviewed status, and effective due status. A new server endpoint is not expected unless the implementation discovers a specific need.

## Relationship to Training

Learn and Train should remain logically independent.

Required behavior:

- `Start training` from Learn navigates to the normal training page.
- The normal training page loads its normal scheduled queue.
- Learn does not pass selected card IDs to Train.
- Train does not alter its ordering, scope, or FSRS behavior based on Learn.
- Training remains the only place where typed answers, ratings, schedule updates, and review-history records happen.

This means a user can preview new cards, then start training and see those cards because new cards are already due under the existing scheduling model. If the user previewed non-due cards, those cards should not automatically become part of scheduled training.

## Suggested Implementation Areas

These are areas to inspect when implementing the epic, not prescriptive technical instructions.

- `client/src/cards/CardsPage.tsx`: main header navigation and existing deck/card display patterns.
- `client/src/App.tsx`: authenticated route structure for adding a dedicated Learn page.
- `client/src/api.ts`: existing card DTOs and `listCards()` call, which already provide enough card data for selection.
- `client/src/training/TrainPage.tsx`: current training-card layout, direction preference behavior, and completion-state patterns to reuse visually without reusing review submission behavior.
- `client/src/training/direction.ts`: prompt/answer direction helpers that may be useful for a Learn card face toggle.
- `client/src/format.ts`: existing due-status formatting for selection labels.
- `client/src/styles.css`: shared card, header, training-card, selected-state, and mobile styling.
- `e2e/training.spec.ts` and existing card/progress specs: examples for end-to-end flows and assertions that review/progress state changes only when training occurs.

Server-side training code should mainly be treated as a boundary to avoid crossing. The learning flow should not need changes to scheduling services, review routes, progress calculations, or migrations.

## Testing Requirements

Include useful tests for the user behavior and, especially, the non-mutating guarantee.

Minimum expected coverage:

- E2E or component-level coverage for entering Learn from the header.
- Coverage that new cards are selected by default on the Learn selection screen.
- Coverage that due and all-card bulk selection actions change the selected set as expected.
- Coverage that the user cannot start learning with zero selected cards.
- Coverage that cards can be marked `Still learning` and appear later in the same learning pass rather than immediately next.
- Coverage that cards marked `Remembered` do not reappear until the current pass is complete.
- Coverage that completing a pass shows `Keep learning these cards` and `Start training`.
- Coverage that `Start training` enters the normal training flow.
- Coverage that learning interactions do not update due status, review history, progress metrics, or FSRS scheduling.

Avoid tests that depend on exact random order. Tests should verify invariants, such as selected cards appearing in a pass, remembered cards leaving the current queue, and recently seen cards not appearing immediately when a pass restarts.

## Acceptance Criteria

- Authenticated users can open `Learn` from the main header, immediately to the left of `Train`.
- Learn opens a dedicated card-selection screen.
- All cards are visible on the selection screen.
- New cards are selected by default.
- The user can include due cards through a bulk action.
- The user can include all cards through a bulk action.
- The user can manually select and deselect individual cards.
- Selected cards are visually distinct from unselected cards.
- Card due/review status is visible while selecting.
- Starting learning with zero selected cards is prevented.
- Starting learning creates an ephemeral shuffled client-side session.
- Learning shows one card at a time using the existing training-card visual style.
- The user can freely flip between front and back.
- No answer input appears in Learn.
- No training rating bar appears in Learn.
- `Remembered` removes the card from the current learning pass.
- `Still learning` keeps the card in the current pass but not as the immediate next card.
- Current-cycle progress is visible.
- Completing a learning pass offers `Keep learning these cards` and `Start training`.
- Restarting a pass reshuffles the same selected cards while avoiding immediate replay of the last 20% from the previous pass, with a minimum of 1 card.
- `Start training` navigates to the existing normal scheduled training flow.
- Learning does not call review submission APIs.
- Learning does not update FSRS schedules, due dates, review history, or progress dashboard metrics.
- The flow remains usable on mobile and desktop.

## Out of Scope

- Persisted learning sessions.
- Learning progress across refreshes.
- Passing selected Learn cards into Train.
- Custom training queues.
- Review-history rows for learning interactions.
- Progress dashboard metrics based on learning interactions.
- New scheduling algorithms for Learn.
- Multiple decks.
- Multiple users.
- Card editing.
- Import/export.
- AI-based translation judging.
