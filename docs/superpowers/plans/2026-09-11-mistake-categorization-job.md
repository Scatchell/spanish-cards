# Mistake Categorization Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the background job that classifies non-perfect `review_history` attempts into one of nine linguistic mistake categories via an LLM, storing results in a new `review_categorizations` table.

**Architecture:** A new `server/src/categorization/` module (repository, LLM generator, pure service logic) plus an in-process hourly scheduler started from `server/src/index.ts`. Each tick anti-joins `review_history` against `review_categorizations` to find unprocessed rows, batches them (~30/call) through a structured-output LLM call, and inserts results in one transaction per batch. Zero pending rows means zero LLM calls.

**Tech Stack:** TypeScript, Express 5, `pg`, `node-pg-migrate`, `openai` SDK (Responses API, strict `json_schema` structured output), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-mistake-categorization-job-design.md`

## Global Constraints

- Categories are a fixed set of 9 slugs (see spec) enforced at the app layer via JSON schema enum, not a DB check constraint.
- Only `review_history` rows with `verdict IN ('incorrect', 'correctWithDifferences')` are ever categorized.
- `review_categorizations.review_history_id` is a real FK to `review_history(id)` with `ON DELETE CASCADE`, and `UNIQUE (review_history_id)`.
- No separate watermark/cursor state — "unprocessed" is always defined as "no matching row in `review_categorizations`."
- LLM model is `gpt-5.4-mini` (same as all other call sites), Responses API, `reasoning: { effort: 'low' }` (a deliberate departure from the `'none'` used by the synchronous explanation/answer-check calls, since this job is background/async and several categories genuinely overlap).
- Batch size is ~30 `review_history` rows per LLM call, structured output as `{ results: [{ index, category, rationale }] }`.
- A batch-level failure (API error, timeout, schema-invalid response, index/length mismatch) is logged and skipped — never partial inserts, never a crash out of the scheduler.
- Do not commit after each task — this plan is implemented and committed as one unit (spec + plan + code) at the end, per explicit user instruction for this session.

---

## Task 1: Split unit tests from a new real-DB integration test tier

No such tier exists in this codebase today — every other repository is proven only indirectly via Playwright e2e hitting HTTP routes. This job has no HTTP route, so Task 3's repository correctness (the anti-join query, the cascade delete) needs a test that talks to real Postgres. This task only wires up the tooling; no test files exist yet, so don't run `test:integration` until Task 3.

**Files:**
- Create: `server/vitest.config.ts`
- Create: `server/vitest.integration.config.ts`
- Modify: `server/package.json`
- Modify: `package.json` (root)

**Interfaces:**
- Produces: `pnpm --filter server run test` (unchanged behavior, now explicitly excludes `**/*.integration.test.ts`), `pnpm --filter server run test:integration` (runs only `tests/**/*.integration.test.ts`), root `pnpm run test:integration` (starts dev postgres, runs migrations, then runs the server-workspace integration tests).

- [ ] **Step 1: Create the default vitest config, excluding integration tests**

```ts
// server/vitest.config.ts
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
```

- [ ] **Step 2: Create the integration-only vitest config**

```ts
// server/vitest.integration.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    testTimeout: 15_000,
  },
});
```

- [ ] **Step 3: Add the `test:integration` script to `server/package.json`**

Modify the `scripts` block in `server/package.json`:

```json
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && cp -r src/prompts dist/prompts",
    "start": "node dist/index.js",
    "migrate:up": "node-pg-migrate --envPath ../.env -m migrations up",
    "migrate:down": "node-pg-migrate --envPath ../.env -m migrations down",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "typecheck": "tsc -p tsconfig.typecheck.json"
  },
```

- [ ] **Step 4: Add the root `test:integration` script, ensuring dev postgres and migrations are ready first**

Modify the `scripts` block in the root `package.json`:

```json
    "test": "pnpm --filter server run test && pnpm --filter client run test",
    "test:integration": "pnpm run db:up && pnpm run migrate:up && pnpm --filter server run test:integration",
    "typecheck": "pnpm --filter server run typecheck && pnpm --filter client run typecheck",
```

- [ ] **Step 5: Verify the default suite still passes and excludes the (not-yet-existing) integration pattern**

Run: `pnpm --filter server run test`
Expected: All existing tests still pass, same as before this task (13 test files, 123 tests).

- [ ] **Step 6: Verify the integration script fails cleanly with "no test files" (none exist yet)**

Run: `pnpm --filter server run test:integration`
Expected: Vitest reports no test files matched `tests/**/*.integration.test.ts` and exits non-zero. This is expected at this point in the plan — Task 3 adds the first integration test file.

---

## Task 2: Migration — create `review_categorizations` table

**Files:**
- Create: `server/migrations/1774000000000_create-review-categorizations.cjs`

**Interfaces:**
- Produces: table `review_categorizations(id, review_history_id, category, rationale, model, created_at)`, FK `review_history_id -> review_history(id) ON DELETE CASCADE`, `UNIQUE (review_history_id)`.

- [ ] **Step 1: Write the migration**

```js
// server/migrations/1774000000000_create-review-categorizations.cjs
/* eslint-disable camelcase */

// One row per categorized review_history attempt. Real FK (unlike
// review_history's deliberate non-FK relationship to cards) because
// review_history is append-only and never edited/deleted after insert, so
// there's no risk of a dangling reference. ON DELETE CASCADE guards against
// orphaned categorization rows if a future feature ever deletes history rows
// (nothing does today). UNIQUE(review_history_id) doubles as the anti-join
// key the categorization job uses to find unprocessed rows.
exports.up = (pgm) => {
  pgm.createTable('review_categorizations', {
    id: 'id',
    review_history_id: {
      type: 'integer',
      notNull: true,
      references: 'review_history',
      onDelete: 'CASCADE',
    },
    // One of a fixed set of 9 slugs, enforced at the app layer (see
    // server/src/categorization/repository.ts), not a DB check constraint.
    category: { type: 'varchar(40)', notNull: true },
    // One-sentence explanation from the LLM for why this category was picked.
    rationale: { type: 'text', notNull: true },
    model: { type: 'varchar(50)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('review_categorizations', 'review_categorizations_review_history_id_unique', {
    unique: ['review_history_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('review_categorizations');
};
```

- [ ] **Step 2: Run the migration up against the dev DB**

Run: `pnpm run db:up && pnpm run migrate:up`
Expected: Output includes `### MIGRATION 1774000000000_create-review-categorizations (UP) ###` with the `CREATE TABLE` and `ADD CONSTRAINT` statements, ending in "Migrations complete!".

- [ ] **Step 3: Verify the table shape**

Run: `docker exec -i $(docker ps --filter name=spanish-cards-dev-postgres -q) psql -U admin -d spanish_cards -c '\d review_categorizations'`
Expected: Shows the 6 columns with correct types, the `review_categorizations_review_history_id_unique` unique constraint, and a foreign-key constraint to `review_history(id)` with `ON DELETE CASCADE`.

- [ ] **Step 4: Verify rollback works cleanly**

Run: `pnpm run migrate:down`
Expected: Output includes `### MIGRATION 1774000000000_create-review-categorizations (DOWN) ###` with `DROP TABLE`, ending in "Migrations complete!".

- [ ] **Step 5: Re-apply the migration (leave the dev DB in the post-migration state for Task 3)**

Run: `pnpm run migrate:up`
Expected: Migration re-applies cleanly; table exists again.

---

## Task 3: Repository — unprocessed-rows query and batch insert, with a real-DB integration test

**Files:**
- Create: `server/src/categorization/repository.ts`
- Create: `server/tests/categorization/repository.integration.test.ts`

**Interfaces:**
- Consumes: `DbQueryable`, `DbPool`, `withTransaction` from `server/src/db.ts` (`server/src/db.ts:7,12,14`); `loadConfig` from `server/src/config.ts`; `createPool` from `server/src/db.ts`.
- Produces:
  - `export const CATEGORIES: readonly ['vocabulary', 'verb_form', 'agreement', 'grammar_words', 'word_order', 'missing_extra_meaning', 'spelling_accents', 'idiom', 'recall_failure']`
  - `export type Category = (typeof CATEGORIES)[number]`
  - `export interface UncategorizedReviewHistoryRow { id: number; direction: string; verdict: string; correctText: string; submittedText: string }`
  - `export interface NewCategorization { reviewHistoryId: number; category: Category; rationale: string; model: string }`
  - `export async function findUncategorizedReviewHistory(db: DbQueryable): Promise<UncategorizedReviewHistoryRow[]>`
  - `export async function insertCategorizationBatch(pool: DbPool, inputs: NewCategorization[]): Promise<void>`

- [ ] **Step 1: Write the failing integration test**

```ts
// server/tests/categorization/repository.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import {
  findUncategorizedReviewHistory,
  insertCategorizationBatch,
} from '../../src/categorization/repository.js';

// Marks every row this test file creates, so cleanup only ever touches rows
// this suite owns, never real dev data. Card id is negative (schema allows
// any integer; real cards start at 1 from a serial sequence) as a second,
// belt-and-suspenders marker.
const MARKER = '__categorization_integration_test__';
const FAKE_CARD_ID = -999999;

let pool: DbPool;

async function cleanup() {
  await pool.query('DELETE FROM review_history WHERE submitted_text LIKE $1', [`${MARKER}%`]);
}

async function insertHistoryRow(input: {
  verdict: string;
  submittedText: string;
}): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO review_history (card_id, direction, verdict, rating, correct_text, submitted_text)
     VALUES ($1, 'english-to-spanish', $2, 'again', 'la respuesta correcta', $3)
     RETURNING id`,
    [FAKE_CARD_ID, input.verdict, input.submittedText],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Insert did not return an id');
  }
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

describe('findUncategorizedReviewHistory', () => {
  it('excludes correct verdicts, already-categorized rows, and rows outside the marker', async () => {
    const incorrectId = await insertHistoryRow({
      verdict: 'incorrect',
      submittedText: `${MARKER} pending incorrect`,
    });
    const correctWithDiffsId = await insertHistoryRow({
      verdict: 'correctWithDifferences',
      submittedText: `${MARKER} pending correctWithDifferences`,
    });
    const alreadyCategorizedId = await insertHistoryRow({
      verdict: 'incorrect',
      submittedText: `${MARKER} already categorized`,
    });
    await insertHistoryRow({
      verdict: 'correct',
      submittedText: `${MARKER} plain correct`,
    });

    await insertCategorizationBatch(pool, [
      {
        reviewHistoryId: alreadyCategorizedId,
        category: 'verb_form',
        rationale: 'pre-seeded as already processed',
        model: 'gpt-5.4-mini',
      },
    ]);

    const pending = await findUncategorizedReviewHistory(pool);
    const pendingIds = pending.map((row) => row.id);

    expect(pendingIds).toContain(incorrectId);
    expect(pendingIds).toContain(correctWithDiffsId);
    expect(pendingIds).not.toContain(alreadyCategorizedId);

    const pendingSubmittedTexts = pending.map((row) => row.submittedText);
    expect(pendingSubmittedTexts).not.toContain(`${MARKER} plain correct`);
  });
});

describe('insertCategorizationBatch', () => {
  it('inserts one row per input and the fields round-trip correctly', async () => {
    const historyId = await insertHistoryRow({
      verdict: 'incorrect',
      submittedText: `${MARKER} round trip`,
    });

    await insertCategorizationBatch(pool, [
      {
        reviewHistoryId: historyId,
        category: 'agreement',
        rationale: 'la casa blanco should be la casa blanca',
        model: 'gpt-5.4-mini',
      },
    ]);

    const result = await pool.query<{
      review_history_id: number;
      category: string;
      rationale: string;
      model: string;
    }>('SELECT review_history_id, category, rationale, model FROM review_categorizations WHERE review_history_id = $1', [
      historyId,
    ]);

    expect(result.rows).toEqual([
      {
        review_history_id: historyId,
        category: 'agreement',
        rationale: 'la casa blanco should be la casa blanca',
        model: 'gpt-5.4-mini',
      },
    ]);
  });

  it('cascades on delete: removing the review_history row removes its categorization', async () => {
    const historyId = await insertHistoryRow({
      verdict: 'incorrect',
      submittedText: `${MARKER} cascade check`,
    });
    await insertCategorizationBatch(pool, [
      {
        reviewHistoryId: historyId,
        category: 'spelling_accents',
        rationale: 'tambien vs también',
        model: 'gpt-5.4-mini',
      },
    ]);

    await pool.query('DELETE FROM review_history WHERE id = $1', [historyId]);

    const result = await pool.query('SELECT 1 FROM review_categorizations WHERE review_history_id = $1', [
      historyId,
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it('is a no-op for an empty input array', async () => {
    await expect(insertCategorizationBatch(pool, [])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `pnpm --filter server run test:integration`
Expected: FAIL — `Cannot find module '../../src/categorization/repository.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write the repository implementation**

```ts
// server/src/categorization/repository.ts
import type { DbPool, DbQueryable } from '../db.js';
import { withTransaction } from '../db.js';

export const CATEGORIES = [
  'vocabulary',
  'verb_form',
  'agreement',
  'grammar_words',
  'word_order',
  'missing_extra_meaning',
  'spelling_accents',
  'idiom',
  'recall_failure',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface UncategorizedReviewHistoryRow {
  id: number;
  direction: string;
  verdict: string;
  correctText: string;
  submittedText: string;
}

export interface NewCategorization {
  reviewHistoryId: number;
  category: Category;
  rationale: string;
  model: string;
}

interface UncategorizedRow {
  id: number;
  direction: string;
  verdict: string;
  correct_text: string;
  submitted_text: string;
}

function toUncategorizedRow(row: UncategorizedRow): UncategorizedReviewHistoryRow {
  return {
    id: row.id,
    direction: row.direction,
    verdict: row.verdict,
    correctText: row.correct_text,
    submittedText: row.submitted_text,
  };
}

// "Unprocessed" is always "no matching review_categorizations row" — there is
// no separate watermark/cursor. This is what makes the first-ever run
// naturally backfill all history, and what makes a crashed batch safe to
// simply retry on the next scheduler tick. Unbounded (no LIMIT): this is a
// single-user app, realistic row counts are in the hundreds/low thousands.
export async function findUncategorizedReviewHistory(
  db: DbQueryable,
): Promise<UncategorizedReviewHistoryRow[]> {
  const result = await db.query<UncategorizedRow>(
    `SELECT rh.id, rh.direction, rh.verdict, rh.correct_text, rh.submitted_text
     FROM review_history rh
     LEFT JOIN review_categorizations rc ON rc.review_history_id = rh.id
     WHERE rh.verdict IN ('incorrect', 'correctWithDifferences')
       AND rc.id IS NULL
     ORDER BY rh.id`,
  );
  return result.rows.map(toUncategorizedRow);
}

// One transaction per batch: all rows from a batch's LLM response are
// inserted, or none are (see server/src/categorization/service.ts for the
// batch-failure handling that decides when this is called). ON CONFLICT DO
// NOTHING is defensive: UNIQUE(review_history_id) means a hypothetical
// overlapping tick can never crash the batch, it just no-ops the duplicate.
export async function insertCategorizationBatch(
  pool: DbPool,
  inputs: NewCategorization[],
): Promise<void> {
  if (inputs.length === 0) {
    return;
  }
  await withTransaction(pool, async (tx) => {
    for (const input of inputs) {
      await tx.query(
        `INSERT INTO review_categorizations (review_history_id, category, rationale, model)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (review_history_id) DO NOTHING`,
        [input.reviewHistoryId, input.category, input.rationale, input.model],
      );
    }
  });
}
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `pnpm --filter server run test:integration`
Expected: PASS — 4 tests across `findUncategorizedReviewHistory` and `insertCategorizationBatch`.

- [ ] **Step 5: Run the default unit suite to confirm it's unaffected**

Run: `pnpm --filter server run test`
Expected: PASS, same 123 tests as before (the new integration test file is excluded by `server/vitest.config.ts`).

---

## Task 4: Categorization prompt and LLM generator

**Files:**
- Create: `server/src/prompts/categorize.md`
- Create: `server/src/categorization/llm.ts`

**Interfaces:**
- Consumes: `AppConfig` from `server/src/config.ts`; `CATEGORIES`, `Category` from `./repository.js` (Task 3).
- Produces:
  - `export const CATEGORIZATION_MODEL = 'gpt-5.4-mini'`
  - `export interface CategorizationInput { index: number; direction: string; verdict: string; correctText: string; submittedText: string }`
  - `export interface CategorizationOutput { index: number; category: Category; rationale: string }`
  - `export type CategorizationGenerator = (items: CategorizationInput[]) => Promise<CategorizationOutput[]>`
  - `export function createCategorizationGenerator(config: AppConfig): CategorizationGenerator | null`

- [ ] **Step 1: Write the prompt file**

```markdown
<!-- server/src/prompts/categorize.md -->
You are classifying a Spanish-learner's mistake on one flashcard review attempt
into exactly one category. You are given, for each numbered item: the
direction trained, the verdict the learner received, the expected ("correct")
phrase, and the phrase the learner actually submitted.

Categories (pick exactly one per item):

1. `vocabulary` — Learner knows the general structure but chooses the wrong
   word or confuses similar words. E.g. expected "conocer a María", submitted
   "saber a María".
2. `verb_form` — Correct verb/concept, but wrong person, tense, mood, or verb
   form. E.g. expected "viajaré", submitted "viajo"; expected "tuvimos",
   submitted "tenimos".
3. `agreement` — Gender or singular/plural disagreement between nouns,
   articles, adjectives, etc. E.g. "la casa blanco" instead of "la casa
   blanca".
4. `grammar_words` — Problems with articles, prepositions, pronouns,
   auxiliaries, reflexives, ser/estar, por/para, etc. E.g. "soy cansado"
   instead of "estoy cansado"; "para dos horas" instead of "por dos horas".
5. `word_order` — The right pieces are mostly present but arranged using an
   incorrect structure: pronoun placement, negation, adjective position,
   question structure.
6. `missing_extra_meaning` — Important information is omitted, added, or
   mistranslated, changing or corrupting the intended meaning. E.g. "I never
   go there" translated as "Voy allí" (missing "never").
7. `spelling_accents` — The intended word/form is evident, but spelling,
   diacritics, or written form is wrong. E.g. "tambien" for "también";
   "hablo" for "habló".
8. `idiom` — Grammatically plausible Spanish that is too literal, uses the
   wrong collocation, or isn't how Spanish normally expresses the idea. E.g.
   "soy 20 años" instead of "tengo 20 años".
9. `recall_failure` — There isn't enough correct material to diagnose a
   specific grammar mistake: a blank response, a completely unrelated
   response, or a response with no usable partial answer.

Rules:
- Treat likely typos/keystroke slips as `spelling_accents`, never as the
  underlying grammar/vocabulary category they superficially resemble — unless
  the misspelling also reflects a distinct grammar error (e.g. a genuinely
  wrong verb form that happens to also be misspelled), in which case
  categorize by the grammar error instead.
- If a mistake could plausibly fit two categories, pick the single category
  that best explains the root cause of the error, not every category that
  technically applies.
- Use `recall_failure` only when there isn't enough submitted material to
  diagnose anything more specific — not merely because the answer is very
  wrong.
- For each item, write one short, concrete sentence for `rationale` naming the
  specific words or forms involved, e.g. "Confused the present tense of ir
  for the future tense of viajar."
- Return exactly one result per input item, using the same `index` value
  given for that item.
```

- [ ] **Step 2: Write the LLM generator**

```ts
// server/src/categorization/llm.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { AppConfig } from '../config.js';
import { CATEGORIES } from './repository.js';
import type { Category } from './repository.js';

export const CATEGORIZATION_MODEL = 'gpt-5.4-mini';

const PROMPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../prompts');

function loadPrompt(filename: string): string {
  return readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
}

const INSTRUCTIONS = loadPrompt('categorize.md');

export interface CategorizationInput {
  index: number;
  direction: string;
  verdict: string;
  correctText: string;
  submittedText: string;
}

export interface CategorizationOutput {
  index: number;
  category: Category;
  rationale: string;
}

export type CategorizationGenerator = (
  items: CategorizationInput[],
) => Promise<CategorizationOutput[]>;

// Structured Outputs require an object at the schema root, so the array of
// per-item results is wrapped in a `results` key rather than returned bare.
const CATEGORIZE_BATCH_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'number' },
          category: { type: 'string', enum: [...CATEGORIES] },
          rationale: { type: 'string' },
        },
        required: ['index', 'category', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

function buildInput(items: CategorizationInput[]): string {
  return items
    .map(
      (item) =>
        `${item.index}. direction: ${item.direction}; verdict: ${item.verdict}; ` +
        `correct: "${item.correctText}"; submitted: "${item.submittedText}"`,
    )
    .join('\n');
}

function parseCategorizationBatch(raw: string | undefined): CategorizationOutput[] {
  if (!raw || raw.trim() === '') {
    throw new Error('Empty categorization response from model');
  }
  const parsed = JSON.parse(raw) as { results: CategorizationOutput[] };
  return parsed.results;
}

export function createCategorizationGenerator(config: AppConfig): CategorizationGenerator | null {
  if (!config.openaiSecretKey) {
    return null;
  }
  const client = new OpenAI({
    apiKey: config.openaiSecretKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    timeout: 20_000,
    maxRetries: 1,
  });
  return async (items) => {
    const response = await client.responses.create({
      model: CATEGORIZATION_MODEL,
      instructions: INSTRUCTIONS,
      input: buildInput(items),
      text: {
        format: {
          type: 'json_schema',
          name: 'categorize_batch',
          strict: true,
          schema: CATEGORIZE_BATCH_SCHEMA,
        },
      },
      // Sized for ~30-item batches (~140 tokens/item for a category + short
      // rationale), comparable to the ~500/item budget used for answer_check.
      max_output_tokens: 4200,
      // A deliberate departure from the 'none' used by the synchronous
      // explanation/answer-check calls: this job is background/async with no
      // one waiting on the response, and several categories genuinely
      // overlap (e.g. "soy cansado" could be grammar_words or agreement), so
      // a small reasoning budget is spent on accuracy instead of latency.
      reasoning: { effort: 'low' },
    });
    return parseCategorizationBatch(response.output_text);
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter server run typecheck`
Expected: No errors. (No automated unit test is added for this file — matching the existing codebase convention where `createExplanationGenerator`/`createAnswerCheckGenerator`/`createFollowUpGenerator` in `server/src/explanations/llm.ts` are also untested directly; the `CategorizationGenerator` contract this file implements is exercised via fakes in Task 5's service tests.)

- [ ] **Step 4: Update the build script to keep including the prompts directory (already true — verify only)**

Run: `grep -n "cp -r src/prompts" server/package.json`
Expected: One match — `"build": "tsc && cp -r src/prompts dist/prompts"`. This already copies `categorize.md` along with the existing prompt files; no change needed.

---

## Task 5: Service — chunking and the tick orchestration, with full unit tests

**Files:**
- Create: `server/src/categorization/service.ts`
- Create: `server/tests/categorization/service.test.ts`

**Interfaces:**
- Consumes: `UncategorizedReviewHistoryRow`, `NewCategorization` from `./repository.js` (Task 3); `CategorizationGenerator`, `CategorizationOutput`, `CATEGORIZATION_MODEL` from `./llm.js` (Task 4).
- Produces:
  - `export const BATCH_SIZE = 30`
  - `export function chunk<T>(items: T[], size: number): T[][]`
  - `export interface CategorizationTickDeps { findUncategorized: () => Promise<UncategorizedReviewHistoryRow[]>; insertCategorizationBatch: (inputs: NewCategorization[]) => Promise<void>; generate: CategorizationGenerator | null }`
  - `export interface CategorizationTickResult { processedCount: number; failedBatchCount: number }`
  - `export async function runCategorizationTick(deps: CategorizationTickDeps): Promise<CategorizationTickResult>`

- [ ] **Step 1: Write the failing tests**

```ts
// server/tests/categorization/service.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { NewCategorization, UncategorizedReviewHistoryRow } from '../../src/categorization/repository.js';
import type { CategorizationInput, CategorizationOutput } from '../../src/categorization/llm.js';
import { BATCH_SIZE, chunk, runCategorizationTick } from '../../src/categorization/service.js';

function fakeRow(id: number): UncategorizedReviewHistoryRow {
  return {
    id,
    direction: 'english-to-spanish',
    verdict: 'incorrect',
    correctText: 'la casa blanca',
    submittedText: 'la casa blanco',
  };
}

function echoResults(items: CategorizationInput[]): CategorizationOutput[] {
  return items.map((item) => ({
    index: item.index,
    category: 'agreement',
    rationale: 'gender agreement error',
  }));
}

describe('chunk', () => {
  it('splits evenly divisible arrays', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('puts the remainder in the last chunk', () => {
    const items = Array.from({ length: 61 }, (_, i) => i);
    const batches = chunk(items, 30);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(30);
    expect(batches[1]).toHaveLength(30);
    expect(batches[2]).toHaveLength(1);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 30)).toEqual([]);
  });
});

describe('runCategorizationTick', () => {
  it('no-ops without calling generate or insert when nothing is pending', async () => {
    const generate = vi.fn();
    const insertCategorizationBatch = vi.fn();
    const result = await runCategorizationTick({
      findUncategorized: async () => [],
      insertCategorizationBatch,
      generate,
    });
    expect(result).toEqual({ processedCount: 0, failedBatchCount: 0 });
    expect(generate).not.toHaveBeenCalled();
    expect(insertCategorizationBatch).not.toHaveBeenCalled();
  });

  it('no-ops without calling insert when generate is null (no API key configured)', async () => {
    const insertCategorizationBatch = vi.fn();
    const result = await runCategorizationTick({
      findUncategorized: async () => [fakeRow(1)],
      insertCategorizationBatch,
      generate: null,
    });
    expect(result).toEqual({ processedCount: 0, failedBatchCount: 0 });
    expect(insertCategorizationBatch).not.toHaveBeenCalled();
  });

  it('processes a single batch and inserts mapped rows', async () => {
    const inserted: NewCategorization[][] = [];
    const result = await runCategorizationTick({
      findUncategorized: async () => [fakeRow(1), fakeRow(2)],
      insertCategorizationBatch: async (inputs) => {
        inserted.push(inputs);
      },
      generate: async (items) => echoResults(items),
    });
    expect(result).toEqual({ processedCount: 2, failedBatchCount: 0 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual([
      { reviewHistoryId: 1, category: 'agreement', rationale: 'gender agreement error', model: 'gpt-5.4-mini' },
      { reviewHistoryId: 2, category: 'agreement', rationale: 'gender agreement error', model: 'gpt-5.4-mini' },
    ]);
  });

  it('splits into multiple batches at BATCH_SIZE boundaries', async () => {
    const rows = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => fakeRow(i + 1));
    const generate = vi.fn(echoResults);
    const inserted: NewCategorization[][] = [];
    const result = await runCategorizationTick({
      findUncategorized: async () => rows,
      insertCategorizationBatch: async (inputs) => {
        inserted.push(inputs);
      },
      generate,
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(inserted).toHaveLength(2);
    expect(result).toEqual({ processedCount: BATCH_SIZE + 5, failedBatchCount: 0 });
  });

  it('skips a failing batch and still processes the rest', async () => {
    const rows = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => fakeRow(i + 1));
    let call = 0;
    const inserted: NewCategorization[][] = [];
    const result = await runCategorizationTick({
      findUncategorized: async () => rows,
      insertCategorizationBatch: async (inputs) => {
        inserted.push(inputs);
      },
      generate: async (items) => {
        call += 1;
        if (call === 1) {
          throw new Error('API down');
        }
        return echoResults(items);
      },
    });
    expect(result).toEqual({ processedCount: 5, failedBatchCount: 1 });
    expect(inserted).toHaveLength(1);
  });

  it('treats a response length mismatch as a failed batch, not a crash', async () => {
    const result = await runCategorizationTick({
      findUncategorized: async () => [fakeRow(1), fakeRow(2)],
      insertCategorizationBatch: vi.fn(),
      generate: async () => [{ index: 0, category: 'agreement', rationale: 'only one result' }],
    });
    expect(result).toEqual({ processedCount: 0, failedBatchCount: 1 });
  });

  it('treats a missing index in the response as a failed batch, not a crash', async () => {
    const result = await runCategorizationTick({
      findUncategorized: async () => [fakeRow(1), fakeRow(2)],
      insertCategorizationBatch: vi.fn(),
      generate: async () => [
        { index: 0, category: 'agreement', rationale: 'ok' },
        { index: 0, category: 'agreement', rationale: 'duplicate index, index 1 missing' },
      ],
    });
    expect(result).toEqual({ processedCount: 0, failedBatchCount: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter server run test`
Expected: FAIL — `Cannot find module '../../src/categorization/service.js'`.

- [ ] **Step 3: Write the service implementation**

```ts
// server/src/categorization/service.ts
import type { NewCategorization, UncategorizedReviewHistoryRow } from './repository.js';
import { CATEGORIZATION_MODEL } from './llm.js';
import type { CategorizationGenerator, CategorizationOutput } from './llm.js';

export const BATCH_SIZE = 30;

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export interface CategorizationTickDeps {
  findUncategorized: () => Promise<UncategorizedReviewHistoryRow[]>;
  insertCategorizationBatch: (inputs: NewCategorization[]) => Promise<void>;
  generate: CategorizationGenerator | null;
}

export interface CategorizationTickResult {
  processedCount: number;
  failedBatchCount: number;
}

// Matches each result back to its row by `index` (not by re-echoing text) and
// throws on any shape mismatch, which the caller below treats as a whole
// failed batch — never a partial insert.
function mapResultsToInserts(
  batch: UncategorizedReviewHistoryRow[],
  results: CategorizationOutput[],
): NewCategorization[] {
  if (results.length !== batch.length) {
    throw new Error(
      `Categorization response length mismatch: expected ${batch.length}, got ${results.length}`,
    );
  }
  const byIndex = new Map(results.map((result) => [result.index, result]));
  return batch.map((row, i) => {
    const result = byIndex.get(i);
    if (!result) {
      throw new Error(`Categorization response missing index ${i}`);
    }
    return {
      reviewHistoryId: row.id,
      category: result.category,
      rationale: result.rationale,
      model: CATEGORIZATION_MODEL,
    };
  });
}

// "Unprocessed since last run" is always "not yet in review_categorizations"
// — there is no persisted watermark. A batch-level failure (API error,
// timeout, schema mismatch) is logged and skipped; those rows stay
// unprocessed and are retried automatically on the next tick.
export async function runCategorizationTick(
  deps: CategorizationTickDeps,
): Promise<CategorizationTickResult> {
  const pending = await deps.findUncategorized();
  const generate = deps.generate;
  if (pending.length === 0 || !generate) {
    return { processedCount: 0, failedBatchCount: 0 };
  }

  let processedCount = 0;
  let failedBatchCount = 0;

  for (const batch of chunk(pending, BATCH_SIZE)) {
    try {
      const results = await generate(
        batch.map((row, i) => ({
          index: i,
          direction: row.direction,
          verdict: row.verdict,
          correctText: row.correctText,
          submittedText: row.submittedText,
        })),
      );
      const inputs = mapResultsToInserts(batch, results);
      await deps.insertCategorizationBatch(inputs);
      processedCount += inputs.length;
    } catch (err) {
      failedBatchCount += 1;
      console.error('Categorization batch failed:', err);
    }
  }

  return { processedCount, failedBatchCount };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter server run test`
Expected: PASS — all new `chunk` and `runCategorizationTick` tests pass, plus all 123 pre-existing tests.

---

## Task 6: Scheduler — wire the hourly tick into the running server

**Files:**
- Create: `server/src/categorization/scheduler.ts`
- Modify: `server/src/index.ts:34-39`

**Interfaces:**
- Consumes: `findUncategorizedReviewHistory`, `insertCategorizationBatch` from `./repository.js` (Task 3); `createCategorizationGenerator` from `./llm.js` (Task 4); `runCategorizationTick` from `./service.js` (Task 5); `AppConfig` from `../config.js`; `DbPool` from `../db.js`.
- Produces: `export function startCategorizationScheduler(config: AppConfig, pool: DbPool): void`

- [ ] **Step 1: Write the scheduler**

```ts
// server/src/categorization/scheduler.ts
import type { AppConfig } from '../config.js';
import type { DbPool } from '../db.js';
import { createCategorizationGenerator } from './llm.js';
import { findUncategorizedReviewHistory, insertCategorizationBatch } from './repository.js';
import { runCategorizationTick } from './service.js';

const TICK_INTERVAL_MS = 60 * 60 * 1000;

// Hourly rather than literally daily: the API restarts on every deploy and
// there's no persisted "last run" timestamp, so a fixed 24h timer from
// process boot would drift on every restart. An hourly tick that no-ops
// (zero LLM calls) whenever nothing is pending is restart-safe and still
// satisfies "runs about daily" in practice, while giving low latency on the
// first-ever historical backfill.
export function startCategorizationScheduler(config: AppConfig, pool: DbPool): void {
  const generate = createCategorizationGenerator(config);

  const tick = async () => {
    try {
      const result = await runCategorizationTick({
        findUncategorized: () => findUncategorizedReviewHistory(pool),
        insertCategorizationBatch: (inputs) => insertCategorizationBatch(pool, inputs),
        generate,
      });
      if (result.processedCount > 0 || result.failedBatchCount > 0) {
        console.log(
          `Categorization tick: ${result.processedCount} categorized, ` +
            `${result.failedBatchCount} batch(es) failed`,
        );
      }
    } catch (err) {
      // Must never throw out of the interval callback — one bad tick can't
      // be allowed to kill the scheduler for the rest of the process's life.
      console.error('Categorization tick crashed:', err);
    }
  };

  void tick();
  setInterval(tick, TICK_INTERVAL_MS);
}
```

- [ ] **Step 2: Wire it into the server entrypoint**

The spec named `server/src/app.ts` for this wiring, but `app.ts` is a pure Express app factory — the actual process-level side effects (the DB pool error handler, `app.listen`) already live in `server/src/index.ts`, which is the correct place for a background scheduler too.

Modify `server/src/index.ts`. Replace:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
```

with:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { startCategorizationScheduler } from './categorization/scheduler.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
```

Replace:

```ts
if (!config.mcpToken) {
  console.warn('MCP_TOKEN is not set: /mcp is disabled and will return a configuration error (see .env.example)');
}
if (!config.openaiSecretKey) {
  console.warn('OPENAI_SECRET_KEY is not set: explanation generation is disabled and will return errors (see .env.example)');
}
```

with:

```ts
if (!config.mcpToken) {
  console.warn('MCP_TOKEN is not set: /mcp is disabled and will return a configuration error (see .env.example)');
}
if (!config.openaiSecretKey) {
  console.warn(
    'OPENAI_SECRET_KEY is not set: explanation generation and mistake categorization are disabled (see .env.example)',
  );
}

startCategorizationScheduler(config, pool);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter server run typecheck`
Expected: No errors.

- [ ] **Step 4: Run the full unit suite**

Run: `pnpm --filter server run test`
Expected: PASS, all 123+ tests (startCategorizationScheduler itself has no dedicated unit test — it's a thin `setInterval` wrapper around the already-tested `runCategorizationTick`; see the manual verification step below for end-to-end confidence).

- [ ] **Step 5: Run the e2e suite to confirm nothing regresses**

Run: `pnpm e2e`
Expected: All 23 e2e tests still pass. The scheduler's immediate on-boot tick will run against the fresh e2e Postgres DB (which starts with zero `review_history` rows), find nothing pending, and no-op — it does not call the e2e OpenAI stub and does not affect any existing test.

- [ ] **Step 6: Manually verify the full path against the dev DB**

This is the one part of the job with no automated end-to-end coverage (no HTTP route exists to trigger it, per the spec's explicit scope). Verify it by hand:

1. Run: `pnpm dev`
2. In the app, answer a training card incorrectly (or with a near-miss) to create a real `incorrect`/`correctWithDifferences` `review_history` row.
3. Restart the dev server (`Ctrl+C`, then `pnpm dev` again) so the immediate on-boot tick picks up the new row right away, rather than waiting up to an hour.
4. Check the server log for a line like `Categorization tick: 1 categorized, 0 batch(es) failed`.
5. Run: `docker exec -i $(docker ps --filter name=spanish-cards-dev-postgres -q) psql -U admin -d spanish_cards -c "SELECT category, rationale, model FROM review_categorizations ORDER BY id DESC LIMIT 1;"`
6. Expected: One row with a category from the 9-value set and a plausible rationale for the mistake made in step 2.

---

## Self-Review Notes

- **Spec coverage:** Categories (Task 4 prompt), data model/FK/cascade (Task 2, verified in Task 3's integration test), scope-of-rows filter (Task 3's query), job flow/hourly-no-watermark (Task 6), LLM call shape/model/reasoning effort/batch size (Task 4), error handling/batch isolation (Task 5's tests), and all three spec testing bullets (Task 3 integration test, Task 5 unit tests, Task 6 manual verification standing in for the "seeded DB" bullet per the user's explicit decision to add a new integration tier instead) are each covered by a task above.
- **Deviation from spec wording:** the spec said to wire the scheduler "from `server/src/app.ts`"; Task 6 wires it into `server/src/index.ts` instead, because `app.ts` is a pure Express app factory with no other process-level side effects, while `index.ts` already owns exactly that (the DB pool's error handler, `app.listen`). This preserves the spec's intent (start on boot, alongside the other generator wiring) without misplacing process-lifecycle code.
- **Type consistency check:** `Category`/`CATEGORIES` (Task 3) flow unchanged through `CategorizationOutput`/`CATEGORIZE_BATCH_SCHEMA` (Task 4) into `NewCategorization` (Task 5's `mapResultsToInserts`) and the scheduler (Task 6) — no renames across tasks.
- **No placeholders:** every step above has literal, complete code — no "add error handling here" or "similar to Task N" shorthand.
