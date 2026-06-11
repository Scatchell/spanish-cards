# Epic 01: Foundation, Auth, and Card Management

## Implementation Prompt

Build the first vertical slice of a single-user Spanish flashcard web application. This slice must establish the full project skeleton, developer experience, database/migration foundation, authentication, and responsive card-management experience. The result should be runnable, testable, and useful end-to-end: the single user can log in, create Spanish/English flashcards in batches, view them, and delete them.

The application is for one user only. Do not build multi-user abstractions, registration, teams, card packs, sharing, or permissions beyond a single authenticated session.

## Recommended Stack

Use a pragmatic TypeScript full-stack stack suitable for a small deployable web app. Recommended default:

- React + TypeScript frontend, preferably through a full-stack framework if it reduces boilerplate.
- Node.js backend/API.
- PostgreSQL database.
- Migration tool with explicit up/down rollback support.
- Unit test runner such as Vitest.
- E2E/smoke test runner such as Playwright if practical.
- Dockerfile and sample compose file if reasonable for the chosen stack.

The implementing agent may choose a different stack if it has a good reason, but it must preserve the functional requirements, developer experience, database safety, and deployment-readiness expectations.

## Core Goals

- Create a mobile-responsive web app that works well on desktop and phone.
- Add app-wide authentication using a hardcoded single username/password from environment variables.
- Use PostgreSQL with a safe migration workflow and rollback support.
- Provide a card grid for one deck of cards.
- Support batch creation of multiple new cards before submitting.
- Support hard deletion of existing cards.
- Provide useful tests for real logic and at least one E2E/smoke path.
- Keep the domain separated from UI and infrastructure where practical.

## Authentication Requirements

- The whole app should require authentication.
- Credentials come from environment variables, with `.env.example` documenting defaults such as `APP_USERNAME` and `APP_PASSWORD`.
- Plain text env password comparison is acceptable for MVP.
- Use secure HTTP-only cookie-based sessions or equivalent server-side/session-token validation.
- Sessions should persist across browser restarts until logout or expiration.
- Include logout.
- Do not implement registration, password reset, user profile, or multiple users.

## Card Model

Each card must include at minimum:

- `id`.
- `spanish_text`, required, non-empty.
- `english_text`, required, non-empty.
- `created_at`.
- `updated_at`.

Field constraints:

- Spanish and English fields are single-line strings.
- Use a 70 character maximum for each language field.
- Duplicate cards are allowed.
- No edit behavior in this MVP slice.
- Delete is hard delete.

Create the schema in a migration. Every migration must have an explicit rollback/down migration.

## Card Management UX

Build a responsive card-management page after login.

Required behavior:

- Existing cards appear in a card grid.
- Existing cards should be visually distinct from unsaved draft cards, such as slightly greyed or less prominent compared with new draft cards.
- User can create multiple draft card rows/cards before submitting.
- User submits all valid draft cards in one batch.
- If some draft cards are invalid, save valid cards and leave invalid drafts visible with validation messages.
- Losing unsaved drafts on refresh is acceptable for MVP.
- New cards become part of the single deck after successful submission.
- User can delete existing cards.
- Deletion should be hard delete and should remove the card from the grid.
- Use a confirmation affordance for deletion unless the UI makes accidental deletion very unlikely.

Keyboard and interaction requirements:

- `Cmd+N` on macOS and `Ctrl+N` elsewhere creates a new draft card and focuses its Spanish input.
- Tabbing should move naturally between fields on a draft card, then to the next card.
- The interface should support rapid data entry.
- Avoid hijacking browser shortcuts in a way that breaks normal usage beyond the specified create-card shortcut.

Mobile requirements:

- The card grid should collapse gracefully on phone-sized screens.
- Inputs and buttons must be usable on touch screens.
- No critical interaction should require hover.

## Developer Experience

Provide scripts equivalent to:

- Install dependencies.
- Run app in development mode.
- Run database migrations.
- Roll back the most recent migration or otherwise run down migrations safely.
- Run unit tests.
- Run E2E/smoke tests if implemented.
- Run type checking/linting if configured.

Include clear setup documentation in the repository, preferably in `README.md`, covering:

- Required environment variables.
- Local PostgreSQL setup.
- Migration commands.
- Test commands.
- Development server command.
- Deployment/containerization notes.

Docker readiness:

- Include a `Dockerfile` and sample compose file if practical.
- If not included, document what remains to containerize the app.

## Architecture Expectations

- Keep card-domain logic separate from route handlers/components where practical.
- Avoid overengineering for future multi-user behavior.
- Make database access explicit and testable.
- Put imports at the top of files.
- Prefer small, direct functions over layers that do not yet add value.

## Testing Requirements

Include useful tests, not tests that only assert framework behavior.

Minimum expected coverage:

- Unit tests for card validation and batch-save behavior.
- Unit or integration tests for authentication/session logic where practical.
- Migration smoke coverage or documented manual verification for migrate/rollback.
- E2E/smoke test: unauthenticated user is redirected to login, authenticated user can create at least one card and see it in the grid.

## Acceptance Criteria

- A fresh checkout can be configured from `.env.example` and run locally.
- Database migrations create the required tables and can be rolled back.
- A user can log in with env-configured credentials.
- Authenticated user can view the card grid.
- Authenticated user can create multiple draft cards and submit them as a batch.
- Valid draft cards save even if other drafts are invalid.
- Authenticated user can hard-delete cards.
- The app is usable on desktop and phone widths.
- Scripts and documentation are sufficient for another agent/developer to run, test, migrate, and continue the project.

## Out of Scope

- Card editing.
- Training flow.
- FSRS scheduling.
- Typed answer checking.
- Progress dashboard.
- Multiple decks/packs.
- Multi-user auth.
- Import/export.
