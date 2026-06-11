# Spanish Cards

A single-user Spanish/English flashcard web app. This slice (Epic 01) covers
authentication, batch card creation, and card management. Training with FSRS
scheduling arrives in Epic 02.

## Stack

- **Frontend**: React 19 + TypeScript, Vite, React Router. Plain CSS.
- **Backend**: Node.js + Express 5 + TypeScript (`server/`), serving the built
  client in production.
- **Database**: PostgreSQL 16 (Docker Compose), migrations via
  `node-pg-migrate` with explicit up/down in every migration.
- **Tests**: Vitest unit tests (server domain logic + client drafts reducer),
  Playwright E2E.
- **Auth**: single username/password from env vars; stateless HMAC-signed
  session token in an HTTP-only cookie (30-day expiry, survives server and
  browser restarts, cleared on logout).

## Quick start

Prerequisites: Node 22+, npm 10+, Docker (for PostgreSQL).

```bash
npm install
cp .env.example .env      # adjust APP_USERNAME / APP_PASSWORD / SESSION_SECRET
npm run db:up             # starts PostgreSQL in Docker on host port 5434
npm run migrate:up
npm run dev               # API on :4100, client on :4101
```

Open <http://localhost:4101> and log in with the credentials from your `.env`.

> Ports 4100/4101/5434 were chosen to avoid clashes with other services; change
> them in `.env` (`PORT`), `client/vite.config.ts`, and `docker-compose.yml`
> if needed.

## Environment variables

Documented in `.env.example`:

| Variable         | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string                       |
| `PORT`           | API server port (default 4100)                     |
| `APP_USERNAME`   | Login username (single user)                       |
| `APP_PASSWORD`   | Login password (plain-text comparison, MVP)        |
| `SESSION_SECRET` | HMAC secret for session cookies — long random text |

The server loads `.env` from the repository root.

## Scripts (run from the repo root)

| Command                | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `npm install`          | Install all workspace dependencies               |
| `npm run dev`          | Run API + client dev servers concurrently        |
| `npm run db:up`        | Start the PostgreSQL container                   |
| `npm run db:down`      | Stop the PostgreSQL container                    |
| `npm run migrate:up`   | Apply pending migrations                         |
| `npm run migrate:down` | Roll back the most recent migration              |
| `npm test`             | Run unit tests (server, then client)             |
| `npm run e2e`          | Run Playwright E2E tests (see below)             |
| `npm run typecheck`    | TypeScript checks for both workspaces            |
| `npm run build`        | Production build (server `dist/`, client `dist/`)|
| `npm run start`        | Run the production server (serves built client)  |

## Migrations

Migrations live in `server/migrations/` and every migration defines both `up`
and `down`. Verified workflow:

```bash
npm run migrate:up    # creates the cards table
npm run migrate:down  # rolls it back
npm run migrate:up    # re-applies cleanly
```

## Tests

- **Unit** (`npm test`): card validation, batch-save partitioning, session
  token signing/expiry/tampering, credential checks, and the client drafts
  reducer. No database required.
- **E2E** (`npm run e2e`): requires a migrated database
  (`npm run db:up && npm run migrate:up`) and a `.env`. Playwright boots both
  dev servers itself. First run: `npx playwright install chromium`.

## Card management UX

- Existing cards render in a responsive grid, visually muted next to drafts.
- `Cmd+N` (macOS) / `Ctrl+N` (elsewhere) adds a draft card and focuses its
  Spanish input. Note: some browsers reserve this shortcut at the OS level and
  may also open a new window — the `+ Add card` button always works.
- Drafts are saved in one batch. Valid drafts are saved even when others are
  invalid; invalid drafts stay on screen with field-level messages.
- Entirely blank drafts are skipped on save rather than reported as errors.
- Deleting a card asks for confirmation, then hard-deletes it.
- Unsaved drafts are lost on refresh (accepted for MVP).

## Docker deployment

A multi-stage `Dockerfile` builds and serves the whole app (API + static
client) on port 4100. `docker-compose.yml` wires it to PostgreSQL and runs
migrations on startup:

```bash
docker compose --profile app up --build
```

The `app` service is behind a compose profile so the default
`docker compose up -d postgres` (what `npm run db:up` runs) starts only the
database for local development.

## Project layout

```
server/
  migrations/          node-pg-migrate migrations (explicit up + down)
  src/
    auth/              credentials, session tokens, middleware, routes
    cards/             validation + batch-save domain logic, repository, routes
    app.ts             express app factory
    index.ts           entrypoint (env, pool, static client in production)
client/
  src/
    auth/LoginPage.tsx
    cards/             CardsPage, DraftCardRow, drafts reducer (unit-tested)
    api.ts             typed fetch wrappers
e2e/                   Playwright specs
meta/                  epics and plans
```

Domain logic (validation, batch partitioning, session tokens) lives in plain
modules with no Express/React imports, so it is unit-testable and reusable as
the app grows (Epic 02 adds training + FSRS scheduling on top of this).
