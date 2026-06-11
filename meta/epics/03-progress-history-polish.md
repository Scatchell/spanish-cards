# Epic 03: Progress, History, and Deployment Polish

## Implementation Prompt

Build the third vertical slice of the Spanish flashcard app: progress visibility, review history where useful, and production/deployment polish. This slice should make the MVP feel complete enough to use consistently and deploy to a small personal server.

This prompt is self-contained. Assume the application is a single-user, authenticated, mobile-responsive Spanish flashcard web app backed by PostgreSQL. The user can create/delete cards, log in/out, and train using typed answers with FSRS scheduling. If parts of that foundation are missing, implement the minimal required behavior to satisfy this slice end-to-end.

## Core Goals

- Add a progress/dashboard experience showing learning progress over time.
- Store and use review history if needed to support useful progress metrics.
- Improve the done/continue-studying experience if not fully completed previously.
- Add practical polish to keyboard/mobile flows.
- Strengthen tests around the most valuable user journeys.
- Improve deployment readiness with container/docs/config checks.

## Progress Dashboard Requirements

Create a progress view available to the authenticated user. It can be a dedicated dashboard page or a prominent home section.

Must show at least:

- Total cards.
- Cards due now.
- Cards reviewed today.
- Correct rate today.
- Average daily correct rate.
- Cards learned over time or an equivalent simple trend showing growth/progress.

Preferred additional metrics if low complexity:

- Reviews completed over the last 7 or 30 days.
- Count of cards by rough learning state, such as new/learning/review, if available from FSRS state.
- Current streak, only if it can be calculated cleanly and honestly.
- Last study date.

Keep the display simple. Textual stats and lightweight charts are enough. Do not add a large charting dependency unless it clearly improves the result.

## Review History Guidance

The previous slices may or may not store every review attempt. For this epic, decide what persistence is necessary to support progress metrics cleanly.

If adding review history, store useful fields such as:

- `id`.
- `card_id` where possible.
- Prompt direction.
- Submitted answer, if useful and not overly noisy.
- Whether the answer was detected correct before override.
- Final rating chosen.
- Whether the user overrode incorrect detection with a passing rating.
- Reviewed at timestamp.
- Whether the card was due or extra practice ahead of schedule.

Do not over-prescribe review-history internals if the same user-facing metrics can be achieved more simply. However, avoid losing data that is necessary for progress-over-time calculations.

If cards are hard-deleted, decide whether review history should cascade-delete with the card or retain anonymized aggregate records. For MVP, cascading delete is acceptable if simpler.

Every schema change must use migrations with explicit rollback/down migrations.

## Continue Studying Completion

Ensure the training done screen is complete:

- Clearly congratulate the user when scheduled cards are complete.
- Show at least a small summary of the completed session.
- Offer `Continue studying`.
- Continuing loads the next soonest cards ahead of schedule.
- Extra practice should update FSRS normally when rated.
- The UI should distinguish scheduled reviews from extra practice.

If this was already fully implemented in Epic 02, verify and polish it rather than rebuilding.

## Card and Training Polish

Improve the existing app where it directly supports the MVP goal.

Card management polish:

- Show due/learning status on existing cards if available and useful.
- Show next due date or `Due now` if available and useful.
- Keep existing cards visually distinct from draft cards.
- Preserve fast keyboard entry behavior.
- Keep deletion safe enough to avoid accidental loss.

Training polish:

- Show session progress, such as `3 of 12 scheduled cards`.
- Show whether the current card is scheduled or extra practice.
- Keep rating shortcuts discoverable.
- Ensure answer difference highlighting is understandable on mobile.
- Make wrong-answer confirmation/next-step flow clear and fast.

Do not add card editing in this epic unless explicitly required later. The current MVP intentionally supports creation and deletion only.

## Deployment Readiness

Make the app practical to deploy to a small personal server.

Required:

- `.env.example` documents all required variables.
- Production start/build scripts exist and are documented.
- Migration and rollback commands are documented.
- Database connection configuration works through environment variables.
- Session secret/configuration is documented.
- Basic health check route or documented smoke check exists.

Preferred:

- `Dockerfile` for the app.
- Sample `docker-compose.yml` or `compose.example.yml` including app and Postgres services.
- Documentation explaining how to run migrations in containerized deployment.
- Notes on persistent Postgres storage/volumes.

Do not hardcode deployment-specific hostnames, paths, or secrets.

## Architecture Expectations

- Keep metric calculations in a domain/service module with tests.
- Avoid coupling progress calculations directly to UI rendering.
- Keep the app single-user and single-deck.
- Prefer small, direct implementation over speculative analytics infrastructure.
- Put imports at the top of files.

## Testing Requirements

Strengthen confidence in the MVP with useful tests.

Minimum expected coverage:

- Unit tests for progress metric calculations.
- Unit/integration tests for average daily correct rate.
- Unit/integration tests for cards due now and reviewed today counts.
- E2E test for login -> create cards -> train at least one card -> see dashboard/progress update.
- E2E or integration test for continue-studying ahead of schedule if implemented.
- Migration rollback verification, automated if practical or documented with a tested command.

Avoid excessive snapshot tests or tests that only assert static rendering without behavior.

## Acceptance Criteria

- User can see meaningful progress after completing reviews.
- Dashboard shows total cards, due now, reviewed today, correct rate today, average daily correct rate, and a progress-over-time signal.
- Training done screen has a clear congratulations state and continue-studying path.
- Ahead-of-schedule reviews update FSRS normally and are distinguishable from scheduled reviews.
- Card-management and training screens remain mobile-responsive.
- Deployment documentation and environment examples are sufficient for a small-server deployment.
- Tests cover progress calculations and at least one full user journey.

## Out of Scope

- Multiple users.
- Multiple decks/packs.
- Card editing.
- Import/export.
- Public sharing.
- Push notifications.
- Native mobile app.
- AI-based translation judging.
