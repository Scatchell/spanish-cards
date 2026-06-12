# spanish-cards — working notes for Claude

Single-user Spanish/English flashcard app. React 19 + Vite client (`client/`),
Express 5 API (`server/`), PostgreSQL 16 via Docker Compose. Full docs in
`README.md`; this file is the operational cheat sheet.

## Running things (always via pnpm scripts, never raw docker compose)

| Command          | What it does                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| `pnpm dev`       | Starts the dev postgres container (waits for healthy), then API (`tsx watch`) + client (Vite) as local processes |
| `pnpm e2e`       | Playwright suite; spins up its own compose project + fresh DB, tears down after |
| `pnpm ship`      | Deploys prod: runs compose with `--profile app` from `/srv/containers/sideProjects/spanish-cards` using `.prod-env` there |
| `pnpm db:up` / `db:down` | Start/stop just the dev postgres container                         |
| `pnpm migrate:up` / `migrate:down` | Migrations against the dev DB (reads `.env`)             |
| `pnpm test` / `typecheck` | Unit tests / TS checks for both workspaces                        |

The pnpm scripts wrap all `--env-file` / `--profile` complexity; if you find
yourself typing a raw `docker compose` command, check for a script first.

## Port checks: ALWAYS use `freeport`

This host (beast) runs dozens of Docker services. Before binding or assigning
any port, run `freeport <port>` — it prints `FREE: <port>`, or `IN USE (TCP)`
with the `ss` lines and walks up to the next free port. Parse the output (exit
code is always 0). Caveat: "free right now" ≠ "unallocated" — stopped dev
servers leave their ports unbound, so also check the table below.

## Port allocation (three environments side by side on this host)

| Environment | Client | API  | Postgres | App container (manual only) | OpenAI stub |
| ----------- | ------ | ---- | -------- | --------------------------- | ----------- |
| dev         | 4101   | 4102 | 5436     | 4103                        | —           |
| e2e         | 4113   | 4112 | 55435    | 4114                        | 4115        |
| prod        | —      | 4100 | 5434     | 4100                        | —           |

- Prod serves the built client from the API container, hence no client port.
- The `/mcp` endpoint lives on the API port (it is a route on the Express
  server, not a separate process).
- e2e ports are deliberately distinct from dev: Playwright's
  `reuseExistingServer` would otherwise reuse the dev API and the training
  specs wipe the deck.
- Only prod runs the containerized app (`--profile app`); the dev/e2e
  `APP_HOST_PORT` values exist so a manually started container never collides
  with prod's always-running 4100.

## Env files (which file feeds what)

| File            | Read by                                  | Contains                                  |
| --------------- | ---------------------------------------- | ----------------------------------------- |
| `.env`          | API server (dotenv), Vite config (`loadEnv`), migrations | `PORT`, `DATABASE_URL`, app credentials, `SESSION_SECRET`, `MCP_TOKEN`, `OPENAI_SECRET_KEY` |
| `.dev-env`      | docker compose (`--env-file`) for dev    | Compose project name, postgres container settings, `APP_HOST_PORT` safety valve |
| `.test-env`     | `e2e/env.ts` + compose for the e2e stack | e2e compose project, ports, test DB        |
| `.prod-env`     | compose on the prod checkout (not here)  | Prod compose settings + `APP_ENV_FILE=.prod.app.env` |
| `.prod.app.env` | prod app container (not here)            | Prod app secrets                           |

Key facts:
- The Vite dev server's `/api` proxy follows `PORT` from `.env` automatically
  (`client/vite.config.ts` uses `loadEnv` on the repo root) — change the API
  port in one place only.
- `docker-compose.yml` interpolation defaults (`${VAR:-default}`) target prod
  values (app 4100); the per-env `--env-file` overrides them.
- `.env` here contains only dev credentials (`admin`/`change-me`) — fine to
  read. Real secrets live only in the prod checkout's `.prod-env` /
  `.prod.app.env`; never read those.
- Each `.example` file must stay in sync with its real counterpart's keys.

## Gotchas

- If the API logs "listening" but behaves wrong, confirm who owns the port:
  the prod container answers on 4100 and looks identical to a dev API. The
  server now exits loudly on EADDRINUSE, but check `freeport 4102` first.
- E2E removes its compose volume on teardown; dev postgres data persists in
  the `spanish-cards-dev` project's `pgdata` volume.
