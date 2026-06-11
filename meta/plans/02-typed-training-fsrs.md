# Plan: Epic 02 — Typed Training and FSRS Scheduling

Source epic: `meta/epics/02-typed-training-fsrs.md`

## Tech Decisions

- **FSRS library**: `ts-fsrs` (v5) with default parameters, wrapped in a pure
  domain module so the rest of the server never touches the library directly.
- **Scheduling storage**: new `card_schedules` table, 1:1 with `cards`,
  `ON DELETE CASCADE` so deleting a card removes its scheduling state.
  A card with **no** schedule row is "new" and immediately due (its due time
  falls back to `cards.created_at`), so card creation needs no changes and new
  cards are trainable instantly.
- **Due queue**: `COALESCE(schedule.due, cards.created_at) <= now()` ordered
  ascending (oldest-due-first). "Continue studying" uses the same query with
  the comparison flipped (`> now()`), still ordered soonest-first.
- **Answer checking**: pure client-side domain module (no server roundtrip
  needed — the server only persists the chosen rating). Normalization strips
  diacritics, casing, punctuation (incl. `¿¡`), and extra spaces; words must
  match in order. Diff info is computed alongside the verdict for highlighting.
- **Direction preference**: `sessionStorage` (persists for the browser session,
  as required).
- **API**:
  - `GET /api/training/queue?scope=due|ahead` → `{ cards: [...] }` oldest-due-first.
  - `POST /api/training/reviews` `{ cardId, rating }` → updated schedule.
    Ratings: `again | hard | good | easy`.

## Architecture

```
server/src/training/
  scheduler.ts        # pure ts-fsrs wrapper: empty state, rate, (de)serialize — unit tested
  repository.ts       # due/ahead queries, schedule get/upsert
  routes.ts           # GET /queue, POST /reviews
server/migrations/
  *_create-card-schedules.cjs   # up + down
client/src/training/
  answer-check.ts     # normalization + matching + diff segments — unit tested
  direction.ts        # session-persisted direction preference
  TrainPage.tsx       # flow state machine: answering → revealed → next / done / ahead
  AnswerReveal.tsx    # correct answer + user answer + difference highlighting
  RatingBar.tsx       # rating buttons + 0–3 keyboard shortcuts
e2e/training.spec.ts  # train a due card end-to-end; empty answer defaults to Don't remember
```

## Phases

- [x] Phase 1: Install `ts-fsrs`; `card_schedules` migration with explicit down
- [x] Phase 2: Server training domain — scheduler (unit tested), repository, routes, app wiring
- [x] Phase 3: Client answer-check domain module + unit tests; direction module
- [x] Phase 4: Client training UI — TrainPage, reveal/diff, ratings, shortcuts, nav link, mobile CSS
- [x] Phase 5: E2E tests for the training flow; full verification (test, typecheck, e2e); README

## Success Criteria

- `npm test`, `npm run typecheck`, `npm run e2e` all pass.
- New card → immediately due; rating persists FSRS state; due queue shrinks.
- Oldest-due-first ordering (covered end-to-end: two new cards train in creation order).
- Lenient matching: accents/case/punctuation/inverted punctuation/spacing are
  "correct with differences"; word order matters; incorrect can be overridden.
- Empty answer ⇒ reveal + emphasized `Don't remember`.
- Done screen with "continue studying ahead" that trains not-yet-due cards.
