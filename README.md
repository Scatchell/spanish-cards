# Spanish Cards

A single-user Spanish/English flashcard web app. Epic 01 covers
authentication, batch card creation, and card management. Epic 02 adds typed
training with FSRS spaced-repetition scheduling. Epic 03 adds review history,
a progress dashboard, and deployment polish.

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
- **Scheduling**: FSRS via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)
  with default parameters.

## Quick start

Prerequisites: Node 22+, npm 10+, Docker (for PostgreSQL).

```bash
npm install
cp .env.example .env      # adjust APP_USERNAME / APP_PASSWORD / SESSION_SECRET
cp .dev-env.example .dev-env
cp .test-env.example .test-env
npm run migrate:up        # first run only (needs the db: npm run db:up)
npm run dev               # starts dev postgres in Docker, then API + client
```

Open <http://localhost:4101> and log in with the credentials from your `.env`.

### Port allocation (this host runs dev, e2e, and prod side by side)

| Environment | Client | API  | Postgres | App container* | Where configured                       |
| ----------- | ------ | ---- | -------- | -------------- | -------------------------------------- |
| dev         | 4101   | 4102 | 5436     | 4103           | `.env` (`PORT`, `CLIENT_PORT` optional, `DATABASE_URL`), `.dev-env` |
| e2e         | 4113   | 4112 | 55435    | 4114           | `.test-env`                            |
| prod        | —      | 4100 | 5434     | 4100           | `.prod-env` on the prod checkout       |

\* Only prod normally runs the containerized app (`--profile app`); the dev and
e2e values exist so that manually starting the container for testing never
collides with the always-running prod container on 4100.

The Vite dev server reads the root `.env`, so its `/api` proxy always follows
`PORT` — change the API port in one place only.

## Environment variables

Documented in `.env.example`:

| Variable         | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string                       |
| `PORT`           | API server port (default 4100)                     |
| `APP_USERNAME`   | Login username (single user)                       |
| `APP_PASSWORD`   | Login password (plain-text comparison, MVP)        |
| `SESSION_SECRET` | HMAC secret for session cookies — long random text |
| `MCP_TOKEN`      | Bearer token for the MCP endpoint — long random text. If unset, `/mcp` is disabled with a configuration error |

The server loads `.env` from the repository root. Docker Compose interpolation
can use a separate Compose env file, such as `.dev-env` or `.prod-env`, via
`docker compose --env-file <file> ...`. Example files are templates only; real
environment files such as `.env`, `.dev-env`, `.test-env`, and `.prod-env` must
exist before their corresponding commands are run.

## Scripts (run from the repo root)

| Command                | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `npm install`          | Install all workspace dependencies               |
| `npm run dev`          | Start dev postgres, then API + client dev servers|
| `npm run db:up`        | Start the dev PostgreSQL container (and wait until healthy) |
| `npm run db:down`      | Stop the dev PostgreSQL container                |
| `npm run migrate:up`   | Apply pending migrations                         |
| `npm run migrate:down` | Roll back the most recent migration              |
| `npm test`             | Run unit tests (server, then client)             |
| `npm run e2e`          | Run Playwright E2E tests (see below)             |
| `npm run typecheck`    | TypeScript checks for both workspaces            |
| `npm run build`        | Production build (server `dist/`, client `dist/`)|
| `npm run start`        | Run the production server (serves built client)  |

## Migrations

Migrations live in `server/migrations/` and every migration defines both `up`
and `down` (cards, card schedules, review history). Verified workflow:

```bash
npm run migrate:up    # applies all pending migrations
npm run migrate:down  # rolls back the most recent migration
npm run migrate:up    # re-applies cleanly
```

In the containerized deployment the `app` service runs
`node-pg-migrate ... up` before starting the server (see
`docker-compose.yml`), so migrations apply automatically on each deploy. To
roll back inside the container:

```bash
docker compose --profile app run --rm app \
  npx --no-install node-pg-migrate -m server/migrations down
```

## Tests

- **Unit** (`npm test`): card validation, batch-save partitioning, session
  token signing/expiry/tampering, credential checks, FSRS scheduling
  (intervals, lapses, persistence round trip), answer normalization/matching
  (accents, casing, punctuation, spacing, word order), review submission
  validation, progress metrics (daily buckets with timezone offsets, correct
  rates, streaks, cards-learned trend), fuzzy card search
  (normalization/ranking), MCP endpoint behavior (bearer auth, tool
  listing/calls over Streamable HTTP with a real MCP client against in-memory
  card storage), client display formatters, and the client drafts reducer. No
  database required.
- **E2E** (`npm run e2e`): requires Docker, `.env`, and `.test-env`, but not a
  running dev database. The suite starts an isolated Compose project using
  `.test-env`, creates a fresh `spanish_cards_test` database volume, runs
  migrations from scratch, boots its own server pair on ports 4112/4113, and
  removes the test Compose volume during teardown. First run:
  `npx playwright install chromium`.

## Training UX

- `Train` (from the cards page header) shows due cards one at a time,
  oldest-due-first. Newly created cards are immediately due.
- Default direction is Spanish prompt → English answer; the toggle switches to
  English → Spanish and the preference persists for the browser session.
- Type the answer and press `Enter`. The correct answer is always revealed,
  even when correct. An empty `Enter` counts as "Don't remember".
- Matching is deterministically lenient: accents, capitalization, punctuation
  (including `¿¡`), and extra spaces are forgiven but highlighted in the
  revealed answer. Word identity and word order must match exactly.
- Correct answers offer `Hard` / `Good` / `Easy`; incorrect or empty answers
  default to `Don't remember` but can be overridden to any rating.
- Keyboard shortcuts after reveal: `0` Don't remember (incorrect only),
  `1` Hard, `2` Good, `3` Easy.
- Rating persists the card's FSRS state, which decides when it is next due,
  and appends a review-history row that powers the progress dashboard.
- Session progress shows `Card 3 of 12 scheduled`; extra-practice cards are
  marked `extra practice (ahead of schedule)` instead.
- Finishing the scheduled queue shows a congratulations screen with a session
  summary (cards reviewed, correct rate) and offers studying ahead of
  schedule (soonest-due cards first). Ahead-of-schedule ratings update FSRS
  normally but are recorded as extra practice rather than due reviews.

## Progress dashboard

`Progress` (from the cards page header, or the training done screen) shows:

- Deck stats: total cards, due now, and new/learning/review counts from FSRS
  state.
- Activity: cards reviewed today, correct rate today, average daily correct
  rate, current streak, and last study date.
- 14-day trends: reviews per day and cumulative cards studied, as lightweight
  CSS bar charts (no charting dependency).

Metrics are computed server-side in `server/src/progress/metrics.ts` (pure,
unit-tested) from the `reviews` history table. Days are bucketed in the
browser's timezone, passed as a UTC-offset query parameter. "Correct" means
the answer checker's verdict before any manual rating override, so overriding
a miss to `Good` does not inflate the stats. Review history cascade-deletes
with its card.

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

## MCP access (AI agents)

The Express server exposes a [Model Context Protocol](https://modelcontextprotocol.io)
endpoint over Streamable HTTP at `/mcp` (same server and port as the API:
`http://localhost:4100/mcp` against prod, `http://localhost:4102/mcp` against
the dev API), so AI agents and local LLM tools can manage the deck.

Authentication is a static bearer token, independent of the browser session:
set `MCP_TOKEN` in `.env` (e.g. `openssl rand -hex 32`) and send it on every
request as `Authorization: Bearer <MCP_TOKEN>`. Missing or wrong tokens get a
`401`; if `MCP_TOKEN` is unset the endpoint is disabled and returns a `503`
configuration error.

### Tools

| Tool           | Purpose                                                          |
| -------------- | ---------------------------------------------------------------- |
| `create_card`  | Batch-create cards; valid cards save even when others in the batch fail validation (per-index errors returned). Duplicates allowed. New cards are immediately due for training. |
| `list_cards`   | All cards with both text sides and timestamps, newest first.     |
| `search_cards` | Fuzzy duplicate-check search by `english`, `spanish`, or `both`; ignores case/accents/punctuation and ranks exact > phrase containment > close typo. |

Typical agent flow: `search_cards` with `{"query": "hello", "language":
"english"}` to check for near-duplicates, then `create_card` with
`{"cards": [{"spanish_text": "Hola", "english_text": "Hello"}]}`. Card text
follows the same validation as the web UI: required, single line, at most 70
characters.

### Client setup

Opencode (`opencode.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "spanish-cards": {
      "type": "remote",
      "url": "http://localhost:4100/mcp",
      "enabled": true,
      "oauth": false,
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

OpenClaw (`openclaw.json5`):

```json5
{
  mcp: {
    servers: {
      "spanish-cards": {
        url: "http://localhost:4100/mcp",
        transport: "streamable-http",
        headers: {
          Authorization: "Bearer ${SPANISH_CARDS_MCP_TOKEN}",
        },
      },
    },
  },
}
```

Claude CLI:

```bash
claude mcp add --transport http spanish-cards http://localhost:4100/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```

LM Studio (`mcp.json`):

```json
{
  "mcpServers": {
    "spanish-cards": {
      "url": "http://localhost:4100/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

If you changed `PORT`, adjust the URLs accordingly.

## Docker deployment

A multi-stage `Dockerfile` builds and serves the whole app (API + static
client). `docker-compose.yml` wires it to PostgreSQL and runs migrations on
startup. The `app` service is behind the `app` compose profile, which only
production uses — `npm run deploy` is the normal entry point and assembles the
full `docker compose --env-file .prod-env --profile app up --build` invocation
for you. Local development never starts the `app` service; `npm run db:up`
starts only the database using `.dev-env`.

The Compose env file (`.dev-env`, `.test-env`, `.prod-env`) controls
Docker-specific values: `COMPOSE_PROJECT_NAME` (namespaces containers,
networks, and volumes per environment), host ports, and Postgres container
settings. Production additionally sets `APP_ENV_FILE` to point at the runtime
app env file (`.prod.app.env`) holding app settings and secrets; Compose
overrides `DATABASE_URL` inside the app container so it connects to
`postgres:5432` on the Compose network instead of the host port. For
production, copy `.prod-env.example` to `.prod-env` and
`.prod.app.env.example` to `.prod.app.env` on the production host.

Postgres data persists in the named `pgdata` volume; back it up (or bind-mount
it) before destructive operations like `docker compose down -v`.

From this checkout on the server, deploy the production stack with:

```bash
pnpm run deploy
```

The deploy script runs Docker Compose from
`/srv/containers/sideProjects/spanish-cards` using `.prod-env`, validates the
resolved Compose config without printing it, rebuilds the app image, starts the
`app` profile in detached mode, and prints `docker compose ps`. Override the
paths with `PROD_COMPOSE_DIR` or `PROD_COMPOSE_ENV_FILE` if needed.

### Health check

`GET /api/health` is unauthenticated and verifies database connectivity —
`{"ok":true}` with HTTP 200 when healthy, 503 otherwise. The compose `app`
service uses it as its container healthcheck, and it doubles as a smoke check
after any deployment:

```bash
curl -fsS http://localhost:4100/api/health
```

## Project layout

```
server/
  migrations/          node-pg-migrate migrations (explicit up + down)
  src/
    auth/              credentials, session tokens, middleware, routes
    cards/             validation + batch-save domain logic, repository, routes
    training/          FSRS scheduler wrapper, review recording service, queue/schedule/history repository, routes
    progress/          progress metrics (pure, unit-tested), repository, routes
    mcp/               MCP endpoint: bearer auth, tool definitions, Streamable HTTP routes
    app.ts             express app factory (incl. /api/health and /mcp)
    index.ts           entrypoint (env, pool, static client in production)
client/
  src/
    auth/LoginPage.tsx
    cards/             CardsPage (incl. due status), DraftCardRow, drafts reducer (unit-tested)
    training/          answer matching (unit-tested), direction, TrainPage + components
    progress/          ProgressPage dashboard
    api.ts             typed fetch wrappers
    format.ts          shared display formatters (unit-tested)
e2e/                   Playwright specs + isolated-DB global setup
meta/                  epics and plans
```

Domain logic (validation, batch partitioning, session tokens, FSRS scheduling
decisions, answer normalization/matching) lives in plain modules with no
Express/React imports, so it is unit-testable and easy to evolve.
