# Plan: Epic 01 — Foundation, Auth, and Card Management

Source epic: `meta/epics/01-foundation-auth-card-management.md`

## Tech Stack Decisions

- **Monorepo layout**: npm workspaces with `server/` and `client/` packages; E2E tests at root.
- **Backend**: Node.js + Express 4 + TypeScript, run with `tsx` in dev, compiled with `tsc` for production.
- **Frontend**: React 18 + TypeScript via Vite. React Router for `/login` vs `/` routing. Plain CSS (no CSS framework) — small app, responsive grid via CSS Grid.
- **Database**: PostgreSQL 16 via Docker Compose (host port 5433 — host already runs a Postgres on 5432). Driver: `pg`.
- **Migrations**: `node-pg-migrate` — explicit `up`/`down` in every migration file.
- **Sessions**: stateless HMAC-signed token in an HTTP-only cookie (`spanish_cards_session`). No server-side store, so sessions survive server restarts and browser restarts until expiry (30 days) or logout. Implemented as a small unit-tested domain module (no JWT dependency).
- **Unit tests**: Vitest (server domain logic + client drafts reducer).
- **E2E**: Playwright at repo root, `webServer` boots API + client.
- **Docker**: multi-stage `Dockerfile` (build client + server, serve client statics from Express) + `docker-compose.yml` (app + postgres).

## Architecture

```
server/src/
  config.ts          # env loading, single place
  db.ts              # pg Pool, explicit
  app.ts             # express app factory (testable, no listen)
  index.ts           # entrypoint (listen, static serving in prod)
  auth/
    credentials.ts   # username/password check (domain)
    session-token.ts # HMAC token create/verify (domain)
    middleware.ts    # requireAuth
    routes.ts        # POST /api/login, POST /api/logout, GET /api/me
  cards/
    validation.ts    # card field validation (domain)
    service.ts       # batch-save partitioning logic (domain)
    repository.ts    # SQL access for cards
    routes.ts        # GET /api/cards, POST /api/cards/batch, DELETE /api/cards/:id
client/src/
  api.ts             # fetch wrappers
  App.tsx            # router + auth gate
  auth/LoginPage.tsx
  cards/
    CardsPage.tsx    # grid + drafts UI, Cmd/Ctrl+N shortcut
    drafts.ts        # drafts reducer (domain, unit-tested)
```

## Phases

- [x] Phase 1: Repo skeleton — workspaces, tsconfigs, env files, compose, scripts
- [x] Phase 2: Database — compose postgres, `cards` migration with up/down
- [x] Phase 3: Server — config, auth domain + routes, cards domain + routes, unit tests
- [x] Phase 4: Client — login page, cards page (grid, drafts, batch submit, delete, shortcuts), responsive CSS, drafts reducer tests
- [x] Phase 5: E2E (Playwright) — login redirect, create card, delete card
- [x] Phase 6: Docker + README + final verification

## Success Criteria

- `npm install && cp .env.example .env && npm run db:up && npm run migrate:up && npm run dev` gives a working app.
- `npm run migrate:down` rolls back cleanly.
- `npm test`, `npm run typecheck`, `npm run e2e` all pass.
- Batch submit saves valid drafts, keeps invalid drafts with messages.
- Hard delete with confirmation; Cmd/Ctrl+N creates a draft and focuses Spanish input.
