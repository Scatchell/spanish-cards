# Mistakes Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Mistakes" dashboard page that visualizes `review_categorizations` data (mistake counts per category, and per-category mistake detail with correct/submitted text, rationale, and key terms), plus a header nav update across all four app pages.

**Architecture:** Two new read-only API endpoints (`GET /api/categorization/summary`, `GET /api/categorization/mistakes`) backed by new repository queries against the existing `review_categorizations`/`review_history` tables. A new client module (`client/src/mistakes/`) with a category-card grid + single-open accordion of a paginated mistakes table. Header nav (`.header-actions`) is unified across `CardsPage`, `LearnPage`, `TrainPage`, `ProgressPage` to show the same five items (each page omitting its own link), and `Progress` gets restyled from a plain text link to a pill button in a new secondary accent color that `Mistakes` also uses.

**Tech Stack:** Express 5 + `pg` (server), React 19 + `react-router-dom` (client), `lucide-react` (new client dependency, icons), Vitest + Testing Library (unit/component tests).

**Spec:** [docs/superpowers/specs/2026-09-12-mistakes-dashboard-design.md](../specs/2026-09-12-mistakes-dashboard-design.md)

## Global Constraints

- No schema changes. Read-only against `review_categorizations` (`id`, `review_history_id`, `category`, `rationale`, `key_terms text[]`, `model`, `created_at`) joined to `review_history` (`correct_text`, `submitted_text`, `direction`, `verdict`).
- Nine category slugs, fixed and exhaustive (from `server/src/categorization/repository.ts`'s `CATEGORIES` const): `vocabulary`, `verb_form`, `agreement`, `grammar_words`, `word_order`, `missing_extra_meaning`, `spelling_accents`, `idiom`, `recall_failure`.
- `/api/categorization/summary` always returns all nine categories, zero-filled.
- `/api/categorization/mistakes` uses keyset pagination: sort `(created_at DESC, id DESC)`, cursor `"<createdAt ISO>,<id>"`, `nextCursor: null` when fewer than `limit` rows returned. 400 on missing/invalid `category`.
- New CSS variable `--accent-secondary: #3d7a6e` (muted teal), used by both the restyled `Progress` link and the new `Mistakes` link.
- Header nav unified across all four pages (`CardsPage`, `LearnPage`, `TrainPage`, `ProgressPage`): `Learn`, `Train`, `Progress`, `Mistakes`, `Log out` — each page omits the link to itself. This is wider than the original spec text (which incorrectly assumed all four pages already shared this nav) — confirmed with the user before writing this plan.
- "Practice this category" button: a real `<button disabled title="Coming soon">`, no new tooltip primitive.
- Per this session's earlier instruction: **do not commit after each step.** Work through every task in the working tree uncommitted; a single combined commit (spec + plan + code) happens only at the very end, by the user's request, not automatically by this plan.
- Attribution trailer for the final commit:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TaQY5xeNoc9wGUJh7ivwqt
  ```

---

## File Structure

**Server (new):**
- `server/src/categorization/dashboard-repository.ts` — summary + mistakes queries (kept separate from `repository.ts`, which owns the write-side/job-facing queries).
- `server/src/categorization/routes.ts` — the two GET routes.
- `server/tests/categorization/dashboard-repository.integration.test.ts` — real-Postgres tests for zero-fill and cursor pagination.
- `server/tests/categorization/routes.test.ts` — route-level tests (400s, response shape) with a fake pool/repository.

**Server (modified):**
- `server/src/app.ts` — mount `categorizationRoutes`.

**Client (new):**
- `client/src/mistakes/categoryInfo.ts` — static metadata for the nine categories.
- `client/src/mistakes/MistakesPage.tsx` — page component (loadState machine, category grid, accordion).
- `client/tests/mistakes/MistakesPage.test.tsx` — component tests (client tests live under `client/tests/`, not colocated with `src/` — see `client/vite.config.ts`'s `test.include: ['tests/**/*.test.{ts,tsx}']`).

**Client (modified):**
- `client/src/api.ts` — add `CategorySummary`, `CategoryMistake`, `MistakesPage` (API response type), `fetchCategorizationSummary`, `fetchCategorizationMistakes`.
- `client/src/App.tsx` — add `/mistakes` route.
- `client/src/cards/CardsPage.tsx`, `client/src/learning/LearnPage.tsx`, `client/src/training/TrainPage.tsx`, `client/src/progress/ProgressPage.tsx` — unify header nav.
- `client/src/styles.css` — `--accent-secondary` token, `.progress-link`, `.mistakes-link`, category grid/card, accordion, mistakes table, key-term pill styles.
- `client/package.json` — add `lucide-react`.

---

### Task 1: Server — dashboard repository (summary + mistakes queries)

**Files:**
- Create: `server/src/categorization/dashboard-repository.ts`
- Test: `server/tests/categorization/dashboard-repository.integration.test.ts`

**Interfaces:**
- Consumes: `DbQueryable` from `server/src/db.js`; `Category`, `CATEGORIES` from `server/src/categorization/repository.js`.
- Produces:
  - `export interface CategoryCount { category: Category; count: number }`
  - `export interface CategoryMistake { id: number; category: Category; rationale: string; keyTerms: string[]; correctText: string; submittedText: string; direction: string; verdict: string; createdAt: string }`
  - `export interface MistakesPage { items: CategoryMistake[]; nextCursor: string | null }`
  - `export async function getCategorySummary(db: DbQueryable): Promise<CategoryCount[]>`
  - `export async function getCategoryMistakes(db: DbQueryable, category: Category, opts: { cursor: { createdAt: string; id: number } | null; limit: number }): Promise<MistakesPage>`
  - `export function parseCursor(raw: string): { createdAt: string; id: number } | null` (returns `null` if malformed — caller treats that as "no cursor" is wrong; caller in Task 2 treats malformed as a 400, see Task 2)

This suite connects to the real dev Postgres (same pattern as `server/tests/categorization/repository.integration.test.ts`) — do not run it while `pnpm dev` is running.

- [ ] **Step 1: Write the failing tests**

```ts
// server/tests/categorization/dashboard-repository.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { CATEGORIES } from '../../src/categorization/repository.js';
import { getCategoryMistakes, getCategorySummary, parseCursor } from '../../src/categorization/dashboard-repository.js';

// Connects to real dev Postgres via loadConfig().databaseUrl, same caveat as
// repository.integration.test.ts: do not run alongside `pnpm dev`.
const MARKER = '__dashboard_repository_integration_test__';
const FAKE_CARD_ID = -999998;

let pool: DbPool;

async function cleanup() {
  await pool.query('DELETE FROM review_history WHERE submitted_text LIKE $1', [`${MARKER}%`]);
}

async function insertMistake(input: {
  category: string;
  createdAt: string;
  submittedTextSuffix: string;
}): Promise<number> {
  const historyResult = await pool.query<{ id: number }>(
    `INSERT INTO review_history (card_id, direction, verdict, rating, correct_text, submitted_text)
     VALUES ($1, 'english-to-spanish', 'incorrect', 'again', 'la casa blanca', $2)
     RETURNING id`,
    [FAKE_CARD_ID, `${MARKER} ${input.submittedTextSuffix}`],
  );
  const row = historyResult.rows[0];
  if (!row) throw new Error('Insert did not return an id');
  await pool.query(
    `INSERT INTO review_categorizations (review_history_id, category, rationale, key_terms, model, created_at)
     VALUES ($1, $2, 'test rationale', $3, 'gpt-5.4-mini', $4)`,
    [row.id, input.category, ['blanco', 'blanca'], input.createdAt],
  );
  return row.id;
}

beforeAll(() => {
  pool = createPool(loadConfig().databaseUrl);
});

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('getCategorySummary', () => {
  it('zero-fills categories with no rows and counts categories with rows', async () => {
    await insertMistake({ category: 'agreement', createdAt: '2026-09-01T00:00:00Z', submittedTextSuffix: 'a1' });
    await insertMistake({ category: 'agreement', createdAt: '2026-09-02T00:00:00Z', submittedTextSuffix: 'a2' });
    await insertMistake({ category: 'idiom', createdAt: '2026-09-01T00:00:00Z', submittedTextSuffix: 'i1' });

    const summary = await getCategorySummary(pool);
    const byCategory = new Map(summary.map((row) => [row.category, row.count]));

    expect(summary).toHaveLength(CATEGORIES.length);
    for (const category of CATEGORIES) {
      expect(byCategory.has(category)).toBe(true);
    }
    expect(byCategory.get('agreement')).toBeGreaterThanOrEqual(2);
    expect(byCategory.get('idiom')).toBeGreaterThanOrEqual(1);
    expect(byCategory.get('vocabulary')).toBe(0);
  });
});

describe('getCategoryMistakes', () => {
  it('returns only the requested category, newest first', async () => {
    await insertMistake({ category: 'verb_form', createdAt: '2026-09-01T00:00:00Z', submittedTextSuffix: 'v1' });
    await insertMistake({ category: 'verb_form', createdAt: '2026-09-03T00:00:00Z', submittedTextSuffix: 'v2' });
    await insertMistake({ category: 'agreement', createdAt: '2026-09-02T00:00:00Z', submittedTextSuffix: 'a1' });

    const page = await getCategoryMistakes(pool, 'verb_form', { cursor: null, limit: 50 });
    const ours = page.items.filter((item) => item.submittedText.startsWith(MARKER));

    expect(ours.every((item) => item.category === 'verb_form')).toBe(true);
    expect(ours[0]?.submittedText).toContain('v2');
    expect(ours[1]?.submittedText).toContain('v1');
  });

  it('paginates with a stable tie-break when created_at is identical, and sets nextCursor', async () => {
    const sameTimestamp = '2026-09-05T00:00:00Z';
    const firstId = await insertMistake({ category: 'spelling_accents', createdAt: sameTimestamp, submittedTextSuffix: 's1' });
    const secondId = await insertMistake({ category: 'spelling_accents', createdAt: sameTimestamp, submittedTextSuffix: 's2' });
    const orderedIds = [firstId, secondId].sort((a, b) => b - a); // (created_at DESC, id DESC)

    const firstPage = await getCategoryMistakes(pool, 'spelling_accents', { cursor: null, limit: 1 });
    const ourFirstItem = firstPage.items.find((item) => item.submittedText.startsWith(MARKER));
    expect(ourFirstItem?.id).toBe(orderedIds[0]);
    expect(firstPage.nextCursor).not.toBeNull();

    const cursor = parseCursor(firstPage.nextCursor as string);
    expect(cursor).not.toBeNull();
    const secondPage = await getCategoryMistakes(pool, 'spelling_accents', { cursor, limit: 50 });
    const ourSecondItem = secondPage.items.find((item) => item.submittedText.startsWith(MARKER));
    expect(ourSecondItem?.id).toBe(orderedIds[1]);
  });

  it('returns nextCursor null when the page is short of the limit', async () => {
    await insertMistake({ category: 'idiom', createdAt: '2026-09-01T00:00:00Z', submittedTextSuffix: 'i-only' });
    const page = await getCategoryMistakes(pool, 'idiom', { cursor: null, limit: 50 });
    expect(page.nextCursor).toBeNull();
  });
});

describe('parseCursor', () => {
  it('parses a valid cursor string', () => {
    expect(parseCursor('2026-09-12T14:03:11.000Z,481')).toEqual({
      createdAt: '2026-09-12T14:03:11.000Z',
      id: 481,
    });
  });

  it('returns null for a malformed cursor', () => {
    expect(parseCursor('not-a-cursor')).toBeNull();
    expect(parseCursor('2026-09-12T14:03:11.000Z,not-a-number')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && pnpm test dashboard-repository.integration -- --run` (or `pnpm run test:integration` per the project's script if that's how integration tests are wired — check `server/package.json` scripts first)
Expected: FAIL with "Cannot find module '../../src/categorization/dashboard-repository.js'"

- [ ] **Step 3: Implement `dashboard-repository.ts`**

```ts
// server/src/categorization/dashboard-repository.ts
import type { DbQueryable } from '../db.js';
import type { Category } from './repository.js';
import { CATEGORIES } from './repository.js';

export interface CategoryCount {
  category: Category;
  count: number;
}

export interface CategoryMistake {
  id: number;
  category: Category;
  rationale: string;
  keyTerms: string[];
  correctText: string;
  submittedText: string;
  direction: string;
  verdict: string;
  createdAt: string;
}

export interface MistakesPage {
  items: CategoryMistake[];
  nextCursor: string | null;
}

export interface MistakesCursor {
  createdAt: string;
  id: number;
}

interface CountRow {
  category: Category;
  count: string;
}

// One GROUP BY query merged with the fixed nine-category list, so a category
// with zero rows still appears (the client never special-cases a missing key).
export async function getCategorySummary(db: DbQueryable): Promise<CategoryCount[]> {
  const result = await db.query<CountRow>(
    'SELECT category, COUNT(*) AS count FROM review_categorizations GROUP BY category',
  );
  const counts = new Map(result.rows.map((row) => [row.category, Number(row.count)]));
  return CATEGORIES.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

interface MistakeRow {
  id: number;
  category: Category;
  rationale: string;
  key_terms: string[];
  correct_text: string;
  submitted_text: string;
  direction: string;
  verdict: string;
  created_at: string;
}

function toCategoryMistake(row: MistakeRow): CategoryMistake {
  return {
    id: row.id,
    category: row.category,
    rationale: row.rationale,
    keyTerms: row.key_terms,
    correctText: row.correct_text,
    submittedText: row.submitted_text,
    direction: row.direction,
    verdict: row.verdict,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// Keyset pagination on (created_at DESC, id DESC): created_at alone isn't
// unique enough (a batch insert can share a millisecond timestamp), so id
// breaks ties deterministically without skipping or repeating rows across
// pages, and without an OFFSET that new inserts could shift underneath us.
export async function getCategoryMistakes(
  db: DbQueryable,
  category: Category,
  opts: { cursor: MistakesCursor | null; limit: number },
): Promise<MistakesPage> {
  const params: unknown[] = [category];
  let cursorClause = '';
  if (opts.cursor) {
    params.push(opts.cursor.createdAt, opts.cursor.id);
    cursorClause = `AND (rc.created_at, rc.id) < ($2, $3)`;
  }
  params.push(opts.limit);
  const limitParamIndex = params.length;

  const result = await db.query<MistakeRow>(
    `SELECT rc.id, rc.category, rc.rationale, rc.key_terms, rc.created_at,
            rh.correct_text, rh.submitted_text, rh.direction, rh.verdict
     FROM review_categorizations rc
     JOIN review_history rh ON rh.id = rc.review_history_id
     WHERE rc.category = $1
     ${cursorClause}
     ORDER BY rc.created_at DESC, rc.id DESC
     LIMIT $${limitParamIndex}`,
    params,
  );

  const items = result.rows.map(toCategoryMistake);
  const last = items[items.length - 1];
  const nextCursor = items.length === opts.limit && last ? `${last.createdAt},${last.id}` : null;
  return { items, nextCursor };
}

export function parseCursor(raw: string): MistakesCursor | null {
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  const [createdAt, idStr] = parts;
  const id = Number(idStr);
  if (!createdAt || !Number.isInteger(id)) return null;
  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return { createdAt, id };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: same command as Step 2
Expected: PASS

---

### Task 2: Server — categorization routes

**Files:**
- Create: `server/src/categorization/routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/categorization/routes.test.ts`

**Interfaces:**
- Consumes: `getCategoryMistakes`, `getCategorySummary`, `parseCursor`, `MistakesCursor`, `CategoryCount`, `MistakesPage` types from Task 1's `dashboard-repository.js`; `CATEGORIES`, `Category` from `repository.js`; `DbPool` from `db.js`.
- Produces: `export function categorizationRoutes(pool: DbPool, deps?: { getCategorySummary: typeof getCategorySummary; getCategoryMistakes: typeof getCategoryMistakes }): Router` — mounted in `app.ts` as `app.use('/api/categorization', requireAuth(config), categorizationRoutes(pool));`. The `deps` param defaults to the real `dashboard-repository.js` functions in production, and lets tests inject fakes — this follows the same injectable-dependency shape `server/src/explanations/routes.ts` already uses (see `server/tests/explanations/routes.test.ts`'s `overrides` param), rather than `vi.mock`/`vi.spyOn` on ESM modules.

- [ ] **Step 1: Write the failing tests**

```ts
// server/tests/categorization/routes.test.ts
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { categorizationRoutes } from '../../src/categorization/routes.js';
import type { CategoryCount, MistakesPage } from '../../src/categorization/dashboard-repository.js';

const servers: http.Server[] = [];

afterEach(
  () =>
    new Promise<void>((resolve) => {
      const toClose = servers.splice(0);
      if (toClose.length === 0) {
        resolve();
        return;
      }
      let remaining = toClose.length;
      for (const s of toClose) {
        s.close(() => {
          if (--remaining === 0) resolve();
        });
      }
    }),
);

async function startServer(overrides: {
  getCategorySummary?: () => Promise<CategoryCount[]>;
  getCategoryMistakes?: (...args: unknown[]) => Promise<MistakesPage>;
}): Promise<string> {
  const app = express();
  app.use(
    '/api/categorization',
    categorizationRoutes({} as never, {
      getCategorySummary: overrides.getCategorySummary ?? (async () => []),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getCategoryMistakes: (overrides.getCategoryMistakes as any) ?? (async () => ({ items: [], nextCursor: null })),
    }),
  );
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/categorization`;
}

describe('GET /api/categorization/summary', () => {
  it('returns the summary from the repository', async () => {
    const base = await startServer({
      getCategorySummary: async () => [{ category: 'vocabulary', count: 3 }],
    });
    const res = await fetch(`${base}/summary`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ categories: [{ category: 'vocabulary', count: 3 }] });
  });
});

describe('GET /api/categorization/mistakes', () => {
  it('400s when category is missing', async () => {
    const base = await startServer({});
    const res = await fetch(`${base}/mistakes`);
    expect(res.status).toBe(400);
  });

  it('400s when category is not a known slug', async () => {
    const base = await startServer({});
    const res = await fetch(`${base}/mistakes?category=not_real`);
    expect(res.status).toBe(400);
  });

  it('400s when cursor is malformed', async () => {
    const base = await startServer({});
    const res = await fetch(`${base}/mistakes?category=vocabulary&cursor=garbage`);
    expect(res.status).toBe(400);
  });

  it('returns a page for a valid category', async () => {
    const base = await startServer({
      getCategoryMistakes: async () => ({ items: [], nextCursor: null }),
    });
    const res = await fetch(`${base}/mistakes?category=vocabulary`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('clamps limit to the 1-100 range, defaulting to 50', async () => {
    const getCategoryMistakes = vi.fn(async () => ({ items: [], nextCursor: null }));
    const base = await startServer({ getCategoryMistakes });
    await fetch(`${base}/mistakes?category=vocabulary&limit=500`);
    expect(getCategoryMistakes).toHaveBeenCalledWith(expect.anything(), 'vocabulary', {
      cursor: null,
      limit: 100,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && pnpm test routes.test -- --run` (categorization dir)
Expected: FAIL with "Cannot find module '../../src/categorization/routes.js'"

- [ ] **Step 3: Implement `routes.ts`**

```ts
// server/src/categorization/routes.ts
import { Router } from 'express';
import type { DbPool } from '../db.js';
import { CATEGORIES } from './repository.js';
import type { Category } from './repository.js';
import {
  getCategoryMistakes as defaultGetCategoryMistakes,
  getCategorySummary as defaultGetCategorySummary,
  parseCursor,
} from './dashboard-repository.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

export function categorizationRoutes(
  pool: DbPool,
  deps: {
    getCategorySummary: typeof defaultGetCategorySummary;
    getCategoryMistakes: typeof defaultGetCategoryMistakes;
  } = { getCategorySummary: defaultGetCategorySummary, getCategoryMistakes: defaultGetCategoryMistakes },
): Router {
  const router = Router();

  router.get('/summary', async (_req, res) => {
    const categories = await deps.getCategorySummary(pool);
    res.json({ categories });
  });

  router.get('/mistakes', async (req, res) => {
    const { category, cursor: rawCursor, limit: rawLimit } = req.query;
    if (!isCategory(category)) {
      res.status(400).json({ error: 'Invalid or missing category' });
      return;
    }
    let cursor = null;
    if (typeof rawCursor === 'string') {
      cursor = parseCursor(rawCursor);
      if (!cursor) {
        res.status(400).json({ error: 'Invalid cursor' });
        return;
      }
    }
    const page = await deps.getCategoryMistakes(pool, category, {
      cursor,
      limit: parseLimit(rawLimit),
    });
    res.json(page);
  });

  return router;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: same as Step 2
Expected: PASS

- [ ] **Step 5: Mount the route in `app.ts`**

In `server/src/app.ts`, add the import next to the other categorization-adjacent imports (alphabetical, with the other route imports):

```ts
import { categorizationRoutes } from './categorization/routes.js';
```

And add the mount line next to `progressRoutes`:

```ts
app.use('/api/categorization', requireAuth(config), categorizationRoutes(pool));
```

- [ ] **Step 6: Run the full server test suite**

Run: `cd server && pnpm test`
Expected: PASS (all suites, including the two new ones and the existing ones unaffected)

---

### Task 3: Client — API types and fetch functions

**Files:**
- Modify: `client/src/api.ts`

**Interfaces:**
- Consumes: `request<T>` (existing internal helper), `ApiError` (existing).
- Produces:
  - `export type Category = 'vocabulary' | 'verb_form' | 'agreement' | 'grammar_words' | 'word_order' | 'missing_extra_meaning' | 'spelling_accents' | 'idiom' | 'recall_failure';`
  - `export interface CategoryCount { category: Category; count: number }`
  - `export interface CategoryMistake { id: number; category: Category; rationale: string; keyTerms: string[]; correctText: string; submittedText: string; direction: string; verdict: string; createdAt: string }`
  - `export interface MistakesPageResponse { items: CategoryMistake[]; nextCursor: string | null }`
  - `export function fetchCategorizationSummary(): Promise<{ categories: CategoryCount[] }>`
  - `export function fetchCategorizationMistakes(category: Category, cursor: string | null, limit?: number): Promise<MistakesPageResponse>`

No test file for this task — these are thin wrappers around the existing `request` helper, exercised indirectly by Task 4's component tests (which mock `fetchCategorizationSummary`/`fetchCategorizationMistakes`).

- [ ] **Step 1: Add the types and functions to `client/src/api.ts`**

Add near `ProgressSummary` (types) and `fetchProgress` (functions):

```ts
export type Category =
  | 'vocabulary'
  | 'verb_form'
  | 'agreement'
  | 'grammar_words'
  | 'word_order'
  | 'missing_extra_meaning'
  | 'spelling_accents'
  | 'idiom'
  | 'recall_failure';

export interface CategoryCount {
  category: Category;
  count: number;
}

export interface CategoryMistake {
  id: number;
  category: Category;
  rationale: string;
  keyTerms: string[];
  correctText: string;
  submittedText: string;
  direction: string;
  verdict: string;
  createdAt: string;
}

export interface MistakesPageResponse {
  items: CategoryMistake[];
  nextCursor: string | null;
}
```

```ts
export function fetchCategorizationSummary(): Promise<{ categories: CategoryCount[] }> {
  return request('/api/categorization/summary');
}

export function fetchCategorizationMistakes(
  category: Category,
  cursor: string | null,
  limit = 50,
): Promise<MistakesPageResponse> {
  const params = new URLSearchParams({ category, limit: String(limit) });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return request(`/api/categorization/mistakes?${params.toString()}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && pnpm typecheck`
Expected: PASS (no consumers yet, so this just confirms the new code compiles)

- [ ] **Step 3: Commit is deferred** — no commit here per the Global Constraints; move directly to Task 4.

---

### Task 4: Client — category metadata and `lucide-react` dependency

**Files:**
- Create: `client/src/mistakes/categoryInfo.ts`
- Modify: `client/package.json`

**Interfaces:**
- Consumes: `Category` from `../api.js`; icon components from `lucide-react`.
- Produces: `export interface CategoryInfo { category: Category; label: string; description: string; icon: ComponentType<{ size?: number }> }` and `export const CATEGORY_INFO: CategoryInfo[]` (all nine categories, in the fixed `CATEGORIES` order).

- [ ] **Step 1: Add the dependency**

Run: `cd client && pnpm add lucide-react`

- [ ] **Step 2: Create `categoryInfo.ts`**

```ts
// client/src/mistakes/categoryInfo.ts
import {
  ArrowLeftRight,
  BookOpen,
  HelpCircle,
  Link2,
  MessageSquareQuote,
  Puzzle,
  Repeat,
  Scale,
  SpellCheck,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { Category } from '../api.js';

export interface CategoryInfo {
  category: Category;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
}

// Order matches server/src/categorization/repository.ts's CATEGORIES, and
// descriptions summarize server/src/prompts/categorize.md's category
// definitions — keep both in sync if the prompt's categories change.
export const CATEGORY_INFO: CategoryInfo[] = [
  {
    category: 'vocabulary',
    label: 'Vocabulary',
    description: 'Wrong word or confused similar words.',
    icon: BookOpen,
  },
  {
    category: 'verb_form',
    label: 'Verb form',
    description: 'Right verb, wrong person, tense, or mood.',
    icon: Repeat,
  },
  {
    category: 'agreement',
    label: 'Agreement',
    description: 'Gender or number mismatch between words.',
    icon: Link2,
  },
  {
    category: 'grammar_words',
    label: 'Grammar words',
    description: 'Articles, prepositions, pronouns, ser/estar, por/para.',
    icon: Puzzle,
  },
  {
    category: 'word_order',
    label: 'Word order',
    description: 'Right words, wrong arrangement.',
    icon: ArrowLeftRight,
  },
  {
    category: 'missing_extra_meaning',
    label: 'Missing/extra meaning',
    description: 'Information left out, added, or changed.',
    icon: Scale,
  },
  {
    category: 'spelling_accents',
    label: 'Spelling & accents',
    description: 'Right word, wrong spelling or accent marks.',
    icon: SpellCheck,
  },
  {
    category: 'idiom',
    label: 'Idiom',
    description: 'Too literal a translation of a natural expression.',
    icon: MessageSquareQuote,
  },
  {
    category: 'recall_failure',
    label: "Didn't recall",
    description: 'Blank, unrelated, or no usable answer.',
    icon: HelpCircle,
  },
];
```

- [ ] **Step 3: Typecheck**

Run: `cd client && pnpm typecheck`
Expected: PASS. If any icon name doesn't exist in the installed `lucide-react` version, TypeScript will fail on that import — swap in the closest available icon name from the package (the spec explicitly treats exact icon choice as an implementation detail).

---

### Task 5: Client — header nav unification and new accent color

**Files:**
- Modify: `client/src/styles.css`
- Modify: `client/src/cards/CardsPage.tsx`
- Modify: `client/src/learning/LearnPage.tsx`
- Modify: `client/src/training/TrainPage.tsx`
- Modify: `client/src/progress/ProgressPage.tsx`

**Interfaces:**
- Consumes: existing `.header-actions`, `.train-link`, `.learn-link` classes as the visual template.
- Produces: `.progress-link`, `.mistakes-link` CSS classes; every page's header renders `Learn`, `Train`, `Progress`, `Mistakes`, `Log out`, each page omitting the link to itself, in that left-to-right order (Log out always last, as today).

- [ ] **Step 1: Add the new CSS**

In `client/src/styles.css`, add to `:root` (after `--accent`):

```css
  --accent-secondary: #3d7a6e;
```

After the existing `.learn-link` block (around line 270), add:

```css
/* Progress and Mistakes share the secondary accent so both read as
   first-class nav destinations distinct from the Learn/Train flow. */
.progress-link {
  color: var(--accent-secondary);
  text-decoration: none;
  border: 1px solid var(--accent-secondary);
  border-radius: var(--radius);
  padding: 0.55rem 1.25rem;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

.mistakes-link {
  color: var(--accent-secondary);
  text-decoration: none;
  border: 1px solid var(--accent-secondary);
  border-radius: var(--radius);
  padding: 0.55rem 1.25rem;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  background: color-mix(in srgb, var(--accent-secondary) 12%, transparent);
}
```

(`.mistakes-link` gets a faint tinted background so it reads as visually distinct from `.progress-link` at a glance, per the spec's "distinct enough" requirement, without introducing a third color.)

- [ ] **Step 2: Update `CardsPage.tsx` header**

Replace the existing header block:

```tsx
<header className="app-header">
  <h1>Spanish Cards</h1>
  <div className="header-actions">
    <Link to="/learn" className="learn-link">
      Learn
    </Link>
    <Link to="/train" className="train-link">
      Train
    </Link>
    <Link to="/progress" className="progress-link">
      Progress
    </Link>
    <Link to="/mistakes" className="mistakes-link">
      Mistakes
    </Link>
    <button type="button" className="secondary" onClick={handleLogout}>
      Log out
    </button>
  </div>
</header>
```

- [ ] **Step 3: Update `LearnPage.tsx` header**

Find the existing header (`<h1>Learn</h1>` block with `Back to cards` + `Log out`). Replace its `.header-actions` contents so it matches the same five-item pattern, omitting `Learn` (this page) and keeping the existing `handleLogout`:

```tsx
<header className="app-header">
  <h1>Learn</h1>
  <div className="header-actions">
    <Link to="/train" className="train-link">
      Train
    </Link>
    <Link to="/progress" className="progress-link">
      Progress
    </Link>
    <Link to="/mistakes" className="mistakes-link">
      Mistakes
    </Link>
    <button type="button" className="secondary" onClick={handleLogout}>
      Log out
    </button>
  </div>
</header>
```

Drop the old standalone `Back to cards` link — `Learn`'s "home" is reachable via the `Spanish Cards` h1 on `CardsPage`'s own nav is not present here, so add a plain `.back-link` to cards alongside the others so users aren't stranded:

```tsx
<header className="app-header">
  <h1>Learn</h1>
  <div className="header-actions">
    <Link to="/" className="back-link">
      Back to cards
    </Link>
    <Link to="/train" className="train-link">
      Train
    </Link>
    <Link to="/progress" className="progress-link">
      Progress
    </Link>
    <Link to="/mistakes" className="mistakes-link">
      Mistakes
    </Link>
    <button type="button" className="secondary" onClick={handleLogout}>
      Log out
    </button>
  </div>
</header>
```

(This final version — with `Back to cards` retained — is the one to actually implement; the intermediate snippet above was illustrative only.)

- [ ] **Step 4: Update `TrainPage.tsx` header**

`TrainPage` currently has no `Log out` button and no `.header-actions` wrapper (just `<h1>` and a bare `Link`). Find its `handleLogout` — if `TrainPage` doesn't already define one, add it using the same pattern as `CardsPage`'s (`import { logout } from '../api.js'`, then `async function handleLogout() { await logout().catch(() => undefined); onLoggedOut(); }`). Replace the header with:

```tsx
<header className="app-header">
  <h1>Training</h1>
  <div className="header-actions">
    <Link to="/" className="back-link">
      Back to cards
    </Link>
    <Link to="/learn" className="learn-link">
      Learn
    </Link>
    <Link to="/progress" className="progress-link">
      Progress
    </Link>
    <Link to="/mistakes" className="mistakes-link">
      Mistakes
    </Link>
    <button type="button" className="secondary" onClick={handleLogout}>
      Log out
    </button>
  </div>
</header>
```

- [ ] **Step 5: Update `ProgressPage.tsx` header**

Replace the existing header:

```tsx
<header className="app-header">
  <h1>Progress</h1>
  <div className="header-actions">
    <Link to="/" className="back-link">
      Back to cards
    </Link>
    <Link to="/learn" className="learn-link">
      Learn
    </Link>
    <Link to="/train" className="train-link">
      Train
    </Link>
    <Link to="/mistakes" className="mistakes-link">
      Mistakes
    </Link>
    <button type="button" className="secondary" onClick={handleLogout}>
      Log out
    </button>
  </div>
</header>
```

`ProgressPage` doesn't currently define `handleLogout` or import `logout` — add both, matching `CardsPage`'s pattern (`import { logout } from '../api.js';` and the `onLoggedOut` prop it already receives).

- [ ] **Step 6: Run client unit tests**

Run: `cd client && pnpm test`
Expected: PASS. If any existing test asserts on the old header content (e.g. queries for a `Progress` link by its old class or text position), update that assertion to match the new nav — check `client/src/cards/CardsPage.test.tsx`, `client/src/learning/LearnPage.test.tsx`, `client/src/training/TrainPage.test.tsx`, `client/src/progress/ProgressPage.test.tsx` (or wherever these tests live) for header-related assertions first.

- [ ] **Step 7: Manually verify in the browser**

Run `pnpm dev`, log in, and click through all four pages, confirming each header shows the correct four links (omitting itself) + Log out, and that Progress/Mistakes render as pill buttons in the teal accent, visually distinct from each other and from Learn/Train.

---

### Task 6: Client — `MistakesPage` route and component

**Files:**
- Create: `client/src/mistakes/MistakesPage.tsx`
- Create: `client/tests/mistakes/MistakesPage.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: `fetchCategorizationSummary`, `fetchCategorizationMistakes`, `ApiError`, `CategoryCount`, `CategoryMistake`, `Category` from `../api.js`; `CATEGORY_INFO` from `./categoryInfo.js`.
- Produces: `export function MistakesPage({ onLoggedOut }: { onLoggedOut: () => void }): JSX.Element`, mounted at `/mistakes` in `App.tsx`.

- [ ] **Step 1: Write the failing component tests**

Client tests live under `client/tests/`, not colocated with `src/` (see `client/vite.config.ts`'s `test.include`), and component tests need the `// @vitest-environment jsdom` pragma (see `client/tests/training/AnswerReveal.test.tsx`). There's no existing full-page test that mocks `api.js` to copy from — the pattern below (`vi.mock` of the whole module) is new to this codebase but standard Vitest usage:

```tsx
// client/tests/mistakes/MistakesPage.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MistakesPage } from '../../src/mistakes/MistakesPage.js';
import * as api from '../../src/api.js';

vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof api>('../../src/api.js');
  return {
    ...actual,
    fetchCategorizationSummary: vi.fn(),
    fetchCategorizationMistakes: vi.fn(),
  };
});

const mockedSummary = api.fetchCategorizationSummary as unknown as ReturnType<typeof vi.fn>;
const mockedMistakes = api.fetchCategorizationMistakes as unknown as ReturnType<typeof vi.fn>;

function summaryWith(overrides: Partial<Record<string, number>>) {
  const categories = [
    'vocabulary',
    'verb_form',
    'agreement',
    'grammar_words',
    'word_order',
    'missing_extra_meaning',
    'spelling_accents',
    'idiom',
    'recall_failure',
  ].map((category) => ({ category, count: overrides[category] ?? 0 }));
  return { categories };
}

beforeEach(() => {
  mockedSummary.mockReset();
  mockedMistakes.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MistakesPage onLoggedOut={() => {}} />
    </MemoryRouter>,
  );
}

describe('MistakesPage', () => {
  it('renders all nine category cards from the summary, with zero-count categories muted and non-clickable', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 5 }));
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    expect(screen.getByText('Vocabulary')).toBeInTheDocument();
    expect(screen.getAllByText(/Coming soon|Practice this category/i).length).toBeGreaterThan(0);

    const vocabButton = screen.getByRole('button', { name: /vocabulary/i });
    fireEvent.click(vocabButton);
    expect(mockedMistakes).not.toHaveBeenCalled();
  });

  it('opens a category with mistakes and renders its table', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 2 }));
    mockedMistakes.mockResolvedValue({
      items: [
        {
          id: 1,
          category: 'agreement',
          rationale: 'la casa blanco should be la casa blanca',
          keyTerms: ['blanco', 'blanca'],
          correctText: 'la casa blanca',
          submittedText: 'la casa blanco',
          direction: 'english-to-spanish',
          verdict: 'incorrect',
          createdAt: '2026-09-12T14:03:11.000Z',
        },
      ],
      nextCursor: null,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));

    await waitFor(() => expect(screen.getByText('la casa blanca')).toBeInTheDocument());
    expect(screen.getByText('la casa blanco')).toBeInTheDocument();
    expect(screen.getByText(/la casa blanco should be la casa blanca/)).toBeInTheDocument();
    expect(screen.getByText('blanco')).toBeInTheDocument();
    expect(screen.getByText('blanca')).toBeInTheDocument();
  });

  it('loads more mistakes when Load more is clicked', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 2 }));
    mockedMistakes
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            category: 'agreement',
            rationale: 'r2',
            keyTerms: [],
            correctText: 'c2',
            submittedText: 's2',
            direction: 'english-to-spanish',
            verdict: 'incorrect',
            createdAt: '2026-09-12T14:03:11.000Z',
          },
        ],
        nextCursor: '2026-09-12T14:03:11.000Z,2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            category: 'agreement',
            rationale: 'r1',
            keyTerms: [],
            correctText: 'c1',
            submittedText: 's1',
            direction: 'english-to-spanish',
            verdict: 'incorrect',
            createdAt: '2026-09-11T14:03:11.000Z',
          },
        ],
        nextCursor: null,
      });
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));
    await waitFor(() => expect(screen.getByText('c2')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(screen.getByText('c1')).toBeInTheDocument());
    expect(mockedMistakes).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});
```

Check whichever existing client test file (e.g. `client/src/cards/CardsPage.test.tsx`) actually establishes the house `vi.mock('../api.js', ...)` convention, and adjust the mock setup above to match if it differs.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && pnpm test MistakesPage`
Expected: FAIL with "Cannot find module './MistakesPage.js'"

- [ ] **Step 3: Implement `MistakesPage.tsx`**

```tsx
// client/src/mistakes/MistakesPage.tsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category, CategoryCount, CategoryMistake } from '../api.js';
import { ApiError, fetchCategorizationMistakes, fetchCategorizationSummary, logout } from '../api.js';
import { CATEGORY_INFO } from './categoryInfo.js';

type LoadState = 'loading' | 'ready' | 'error';

interface CategoryState {
  items: CategoryMistake[];
  nextCursor: string | null;
  loadState: LoadState;
}

export function MistakesPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [counts, setCounts] = useState<Map<Category, number>>(new Map());
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [categoryStates, setCategoryStates] = useState<Map<Category, CategoryState>>(new Map());

  const handleUnauthenticated = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut();
        return true;
      }
      return false;
    },
    [onLoggedOut],
  );

  const load = useCallback(() => {
    setLoadState('loading');
    fetchCategorizationSummary()
      .then((data) => {
        setCounts(new Map(data.categories.map((c: CategoryCount) => [c.category, c.count])));
        setLoadState('ready');
      })
      .catch((err) => {
        if (!handleUnauthenticated(err)) {
          setLoadState('error');
        }
      });
  }, [handleUnauthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCategoryPage = useCallback(
    (category: Category, cursor: string | null) => {
      setCategoryStates((existing) => {
        const next = new Map(existing);
        const current = next.get(category) ?? { items: [], nextCursor: null, loadState: 'loading' as LoadState };
        next.set(category, { ...current, loadState: 'loading' });
        return next;
      });
      fetchCategorizationMistakes(category, cursor)
        .then((page) => {
          setCategoryStates((existing) => {
            const next = new Map(existing);
            const current = next.get(category);
            const items = cursor && current ? [...current.items, ...page.items] : page.items;
            next.set(category, { items, nextCursor: page.nextCursor, loadState: 'ready' });
            return next;
          });
        })
        .catch((err) => {
          if (handleUnauthenticated(err)) return;
          setCategoryStates((existing) => {
            const next = new Map(existing);
            const current = next.get(category) ?? { items: [], nextCursor: null, loadState: 'loading' as LoadState };
            next.set(category, { ...current, loadState: 'error' });
            return next;
          });
        });
    },
    [handleUnauthenticated],
  );

  function handleCardClick(category: Category) {
    const count = counts.get(category) ?? 0;
    if (count === 0) return;
    if (openCategory === category) {
      setOpenCategory(null);
      return;
    }
    setOpenCategory(category);
    if (!categoryStates.has(category)) {
      loadCategoryPage(category, null);
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Mistakes</h1>
        <div className="header-actions">
          <Link to="/" className="back-link">
            Back to cards
          </Link>
          <Link to="/learn" className="learn-link">
            Learn
          </Link>
          <Link to="/train" className="train-link">
            Train
          </Link>
          <Link to="/progress" className="progress-link">
            Progress
          </Link>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main>
        {loadState === 'loading' && <p className="hint">Loading mistakes…</p>}
        {loadState === 'error' && (
          <p className="form-error" role="alert">
            Something went wrong.{' '}
            <button type="button" className="secondary" onClick={load}>
              Retry
            </button>
          </p>
        )}
        {loadState === 'ready' && (
          <>
            <ul className="category-grid">
              {CATEGORY_INFO.map((info) => (
                <CategoryCard
                  key={info.category}
                  info={info}
                  count={counts.get(info.category) ?? 0}
                  open={openCategory === info.category}
                  onClick={() => handleCardClick(info.category)}
                />
              ))}
            </ul>
            {openCategory && (
              <CategoryAccordion
                category={openCategory}
                label={CATEGORY_INFO.find((c) => c.category === openCategory)?.label ?? openCategory}
                state={categoryStates.get(openCategory) ?? { items: [], nextCursor: null, loadState: 'loading' }}
                onRetry={() => loadCategoryPage(openCategory, null)}
                onLoadMore={(cursor) => loadCategoryPage(openCategory, cursor)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CategoryCard({
  info,
  count,
  open,
  onClick,
}: {
  info: (typeof CATEGORY_INFO)[number];
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  const Icon = info.icon;
  const disabled = count === 0;
  return (
    <li className={disabled ? 'category-card muted' : open ? 'category-card open' : 'category-card'}>
      <button
        type="button"
        className="category-card-button"
        onClick={onClick}
        disabled={disabled}
        aria-label={info.label}
      >
        <Icon size={36} />
        <span className="category-card-label">{info.label}</span>
        <span className="category-card-description hint">{info.description}</span>
        <span className="category-card-count">{count} mistake{count === 1 ? '' : 's'}</span>
      </button>
      <button type="button" className="secondary" disabled title="Coming soon">
        Practice this category
      </button>
    </li>
  );
}

function CategoryAccordion({
  category,
  label,
  state,
  onRetry,
  onLoadMore,
}: {
  category: Category;
  label: string;
  state: CategoryState;
  onRetry: () => void;
  onLoadMore: (cursor: string) => void;
}) {
  return (
    <section className="mistakes-accordion" aria-label={`${label} mistakes`}>
      <h2>{label}</h2>
      {state.loadState === 'loading' && state.items.length === 0 && (
        <p className="hint">Loading mistakes…</p>
      )}
      {state.loadState === 'error' && (
        <p className="form-error" role="alert">
          Something went wrong.{' '}
          <button type="button" className="secondary" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {state.items.length > 0 && (
        <>
          <table className="mistakes-table">
            <thead>
              <tr>
                <th>Correct</th>
                <th>Submitted</th>
                <th>Rationale</th>
                <th>Key terms</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.correctText}</td>
                  <td>{item.submittedText}</td>
                  <td>{item.rationale}</td>
                  <td>
                    {item.keyTerms.map((term) => (
                      <span key={term} className="key-term-pill">
                        {term}
                      </span>
                    ))}
                  </td>
                  <td>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.nextCursor && (
            <button
              type="button"
              className="secondary"
              onClick={() => onLoadMore(state.nextCursor as string)}
              disabled={state.loadState === 'loading'}
            >
              Load more
            </button>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Add the route to `App.tsx`**

```tsx
import { MistakesPage } from './mistakes/MistakesPage.js';
```

```tsx
<Route
  path="/mistakes"
  element={
    auth === 'authenticated' ? (
      <MistakesPage onLoggedOut={() => setAuth('anonymous')} />
    ) : (
      <Navigate to="/login" replace />
    )
  }
/>
```

- [ ] **Step 5: Add the CSS**

Append to `client/src/styles.css`:

```css
/* ---- Mistakes dashboard ---- */

.category-grid {
  list-style: none;
  margin: 0 0 1.5rem;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.75rem;
}

.category-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.category-card.open {
  border-color: var(--accent-secondary);
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.06);
}

.category-card.muted {
  background: var(--surface-muted);
  color: var(--text-muted);
}

.category-card-button {
  background: transparent;
  color: inherit;
  border: none;
  padding: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  text-align: left;
  cursor: pointer;
}

.category-card-button:disabled {
  cursor: default;
  opacity: 1;
}

.category-card-label {
  font-weight: 600;
}

.category-card-description {
  font-size: 0.8rem;
}

.category-card-count {
  font-size: 0.8rem;
  color: var(--accent-secondary);
}

.mistakes-accordion {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}

.mistakes-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.75rem;
}

.mistakes-table th,
.mistakes-table td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

.mistakes-table th {
  color: var(--text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.key-term-pill {
  display: inline-block;
  background: var(--surface-muted);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  margin: 0 0.25rem 0.25rem 0;
  font-size: 0.75rem;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd client && pnpm test`
Expected: PASS (new `MistakesPage.test.tsx` plus no regressions from Task 5's header changes)

- [ ] **Step 7: Typecheck**

Run: `cd client && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Manually verify in the browser**

Run `pnpm dev`, click into `/mistakes` from any page's nav, confirm: all nine cards render, zero-count categories are muted and unclickable, clicking a populated category opens its accordion (closing any previously open one), the table shows correct/submitted/rationale/key terms/date, "Load more" works if you have enough seeded data (or accept a single page if not — pagination logic is already covered by tests), and the disabled "Practice this category" button shows the "Coming soon" tooltip on hover.

---

## Final Steps (after all tasks pass)

- [ ] Run the full test suite for both workspaces: `pnpm test` (root, if that fans out to both) or `cd server && pnpm test && cd ../client && pnpm test`.
- [ ] Run `pnpm typecheck` for both workspaces.
- [ ] Run `pnpm e2e` if the user wants e2e confirmation before the single combined commit (optional — ask first, since it's slower).
- [ ] Per this session's standing instruction: do a single `git add` covering the spec, this plan, and all code changes, then one commit (not one per task) with the required attribution trailer. Do not push.
