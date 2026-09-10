# Mistake categorization job — design

## Context

`review_history` (see `data-analysis.md`) logs every training review submission
but is currently write-only — nothing reads from it. This is the first piece
of a larger feature: letting the user explore which types of Spanish mistakes
they make most often and practice them with generated example sentences. That
larger feature needs failures classified into useful linguistic categories
before anything else can be built on top of it.

This spec covers **only the categorization job** — the background process
that reads `review_history`, classifies non-perfect attempts into one of nine
fixed categories using an LLM, and stores the result. The later "explore by
category" page and example-sentence generator are out of scope here and will
get their own design once this data exists to build on.

## Categories

Nine fixed categories, chosen for the kinds of Spanish learner mistakes this
app's history has been observed to contain:

| slug | meaning |
|---|---|
| `vocabulary` | Wrong word / confused similar words |
| `verb_form` | Correct verb/concept, wrong person/tense/mood/form |
| `agreement` | Gender/number disagreement (noun/article/adjective) |
| `grammar_words` | Articles, prepositions, pronouns, reflexives, ser/estar, por/para, etc. |
| `word_order` | Right pieces, wrong arrangement |
| `missing_extra_meaning` | Info omitted/added/mistranslated |
| `spelling_accents` | Right word/form, wrong spelling or diacritics |
| `idiom` | Grammatically plausible but too literal / wrong collocation |
| `recall_failure` | Not enough material to diagnose — blank, unrelated, or "again" |

These are enforced at the app layer (JSON schema enum), not a DB check
constraint, so adding a 10th category later is a code change only, no
migration.

## Data model

New migration `server/migrations/<ts>_create-review-categorizations.cjs`:

```sql
CREATE TABLE review_categorizations (
  id                 SERIAL PRIMARY KEY,
  review_history_id  INTEGER NOT NULL REFERENCES review_history(id) ON DELETE CASCADE,
  category           VARCHAR(40) NOT NULL,
  rationale          TEXT NOT NULL,
  model              VARCHAR(50) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_history_id)
);
```

Design decisions:

- **New table, not a column on `review_history`.** Keeps `review_history`
  untouched (it's deliberately write-only/self-contained per its migration
  comment), gives a natural timestamped log, and lets a future
  re-categorization pass (e.g. after a category taxonomy change or a model
  upgrade) insert fresh rows without mutating history.
- **Real FK with `ON DELETE CASCADE`**, unlike `review_history`'s deliberate
  non-FK relationship to `cards`. `review_history` is append-only and never
  edited/deleted after insert (unlike `cards`, which motivated the
  non-FK design there), so a real FK is safe. Nothing in the app deletes
  `review_history` rows today, but `ON DELETE CASCADE` guards against orphaned
  categorization rows if that ever changes, at no cost now.
- **`UNIQUE (review_history_id)`** — one categorization per history row. This
  constraint doubles as the anti-join key the job uses to find unprocessed
  rows (see below), so "has this row been categorized" needs no separate
  tracking state.
- **No duplicated text columns.** `correct_text`/`submitted_text` are read via
  a join to `review_history` when needed (dashboard, example-sentence
  feature) rather than snapshotted again.
- **`rationale`** is a one-sentence explanation from the LLM (parallel to the
  existing `answer_checks.critique_markdown` pattern) — gives a debugging
  trail for why a category was picked, and may double as reusable UI copy
  later.
- **`model`** records which model produced the categorization, matching the
  `model` column already present on `explanations`/`answer_checks`, to
  support future re-categorization/versioning.

## Scope of rows

Only `review_history` rows with `verdict IN ('incorrect', 'correctWithDifferences')`
are categorized. Plain `correct` rows carry no diagnostic signal for "what
mistake did the user make" and are never sent to the LLM or given a row in
`review_categorizations`.

## Job flow

New module `server/src/categorization/` (mirrors `server/src/explanations/`
structure: `service.ts`, `repository.ts`, `llm.ts`).

1. An in-process scheduler is started from `server/src/app.ts` alongside the
   existing generator wiring: `setInterval(runCategorizationTick, ONE_HOUR_MS)`,
   plus one immediate run on server boot.
2. Each tick:
   a. Query for unprocessed rows via anti-join:
      ```sql
      SELECT rh.* FROM review_history rh
      LEFT JOIN review_categorizations rc ON rc.review_history_id = rh.id
      WHERE rh.verdict IN ('incorrect', 'correctWithDifferences')
        AND rc.id IS NULL
      ORDER BY rh.id
      ```
   b. If zero rows: no-op. No LLM call, nothing written.
   c. Otherwise: chunk into batches of ~30, call the LLM once per batch (see
      below), and insert one `review_categorizations` row per input item from
      that batch's response, in a single transaction per batch.
3. No separate "first run" branch and no persisted watermark/cursor exist.
   "New since last run" is always defined as "not yet present in
   `review_categorizations`" — this is what makes the first-ever run
   naturally backfill all historical rows (everything is unprocessed), and
   what makes a crashed/failed batch safe to simply retry on the next tick.

**Why hourly, not literally once a day:** the API server restarts on every
deploy, and there's no persisted "last run" timestamp. An hourly tick that
does one cheap `COUNT`-equivalent check and no-ops when nothing is pending is
restart-safe, avoids drift/missed-run edge cases a fixed 24h timer from
process boot would have, and still satisfies "runs about daily" in practice
while giving lower latency on the first-ever backfill.

## LLM call

Follows the existing pattern in `server/src/explanations/llm.ts` exactly —
same `OpenAI` client construction (`config.openaiSecretKey`,
`config.openaiBaseUrl` for the e2e stub, `timeout: 20_000`, `maxRetries: 1`),
same Responses API usage, same `loadPrompt()` mechanism.

- New generator `createCategorizationGenerator(config)`, wired in `app.ts`
  next to the other three generators.
- New prompt file `server/src/prompts/categorize.md` describing the nine
  categories and the rule "pick exactly one category per item."
- Model: **`gpt-5.4-mini`**, same as all three existing call sites — this job
  needs comparably nuanced linguistic judgment to the existing answer-check
  generator, and reusing the model keeps cost/config/behavior consistent
  across the app.
- `reasoning: { effort: 'low' }` — a deliberate departure from the existing
  call sites' `'none'`. Those are synchronous (a user is waiting on the HTTP
  response), so minimizing latency is the right trade-off there. This job is
  background/async with nothing waiting on it, and several categories
  genuinely overlap (e.g. "soy cansado" could plausibly be filed under
  `grammar_words` or `agreement`), so a small reasoning budget is spent on
  accuracy instead.
- **Structured output**: `text.format = { type: 'json_schema', name:
  'categorize_batch', strict: true, schema: CATEGORIZE_BATCH_SCHEMA }`, where
  the schema is an array of `{ index: number, category: <enum of 9>,
  rationale: string }` — one entry per input item. Items are matched back to
  their `review_history` row by `index`, not by re-echoing the input text
  (avoids subtle text alteration by the model).
- Input: a numbered list built from the batch, each entry containing
  `direction`, `verdict`, `correct_text`, `submitted_text`.
- Batch size: **~30 items per call**. Cuts request count roughly 30x vs.
  one-call-per-row for the large first-run backfill (hundreds of rows) while
  the model still reasons about each item individually within the batch.
  `max_output_tokens` sized accordingly (~4000 for a 30-item batch, comparable
  to the ~500/item budget used for `answer_check`); tune once real output
  sizes are observed.
- No dedup of repeated `(correct_text, submitted_text)` pairs — every
  qualifying row gets its own categorization row and its own LLM judgment.
  Keeps the log fully 1:1 and timestamped with `review_history`, which
  matters for later time-based analysis (e.g. "did this error rate improve
  over time"). Revisit only if repeat volume makes LLM cost noticeable.

## Error handling

- Any batch-level failure (API error, timeout, response that fails schema
  validation, or a response whose array length/index set doesn't match the
  input batch) is logged and the whole batch is skipped — no partial inserts.
  Those rows remain unprocessed and are picked up automatically by the next
  hourly tick's anti-join query; no per-row retry logic is needed.
- Each batch's inserts happen in a single DB transaction (all rows from that
  batch, or none), matching the atomic-insert spirit of the existing
  `explanations`/`answer_checks` repositories.
- The entire tick body is wrapped in try/catch and logged — a single bad tick
  must never throw out of the `setInterval` callback and kill the scheduler
  for the rest of the process's lifetime.

## Testing

- Unit tests for the unprocessed-rows query/batching logic: given a set of
  `review_history` rows and existing `review_categorizations`, verify correct
  row selection and batch boundaries (e.g. 61 rows chunked at size 30 → three
  batches).
- Unit tests for the LLM response → DB row mapping, including the
  index-mismatch failure path, using an injected fake generator — same
  dependency-injection pattern as `getOrCreateExplanation`/
  `getOrCreateAnswerCheck` (pure functions taking `find`/`insert`/`generate`).
- One test against a seeded DB (using `e2e/openai-stub.ts` or an equivalent
  fake) verifying a full tick produces the expected `review_categorizations`
  rows, and that a second tick with no new rows makes zero LLM calls.

## Out of scope (future work, not this spec)

- The "explore by category" page, category/word-frequency dashboard, and
  example-sentence generator described in the original feature request.
- Any UI for viewing categorization results.
- Re-categorization tooling (e.g. bulk re-run after a taxonomy or model
  change) — the schema supports it (new rows, `model` column) but no job or
  UI is being built for it now.
