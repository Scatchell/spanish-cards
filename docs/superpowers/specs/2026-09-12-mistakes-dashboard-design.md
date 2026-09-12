# Mistakes dashboard — design

## Context

[2026-09-11-mistake-categorization-job-design.md](2026-09-11-mistake-categorization-job-design.md)
built the background job that classifies every non-perfect `review_history`
row into one of nine categories and stores it in `review_categorizations`
(with `category`, `rationale`, `key_terms`, `model`). That table has been
running in production and now holds real data, but nothing reads it — there
is no UI.

This spec covers the first of two planned uses for that data: a dashboard
page where the user can review their own mistake history — which categories
they're weakest/strongest in, and the actual examples behind each category.
The second planned use, LLM-generated practice sentences per category, is out
of scope here; this spec only reserves its future button.

## Header nav change (bundled with this work)

Today's header nav (`.header-actions`, present on `CardsPage`, `LearnPage`,
`TrainPage`, `ProgressPage`) renders: `Learn` (outlined accent button),
`Train` (solid accent button), `Progress` (plain muted text link, `.back-link`),
`Log out` (secondary outlined button). `Progress` visually reads as an
afterthought next to the other two nav buttons.

Changes, applied to all four header instances:

- `Progress` becomes a button styled like `Learn` (outlined, pill-shaped,
  `min-height: 44px`) but using a new `--accent-secondary` CSS variable (a
  muted teal, `#3d7a6e`) instead of `--accent`, so it reads as a distinct but
  equally first-class nav destination. New class: `.progress-link`.
- A new `Mistakes` nav button is added (all four headers, same position
  logic as the existing three: omitted from its own page's header, like
  `Progress` never shows a `Progress` link and `Train` never shows a `Train`
  link). Same outlined pill style, using `--accent-secondary` at a lighter
  tint (`.mistakes-link`, `border-color: var(--accent-secondary)`, distinct
  enough at a glance from `Progress` — exact shade is an implementation
  detail decided during frontend-design, not a hard spec requirement).
- `Log out` and its position (always last) are unchanged.

## Data model — no schema changes

Reads only, against the existing `review_categorizations` (joined to
`review_history` for `correct_text`/`submitted_text`/`direction`/`verdict`)
and no new tables/columns. `key_terms` is already a `text[]`.

## API

New module `server/src/categorization/routes.ts` (repository/service already
exist from the prior spec), mounted as:

```ts
app.use('/api/categorization', requireAuth(config), categorizationRoutes(pool));
```

### `GET /api/categorization/summary`

Returns mistake counts for all nine categories, zero-filled for categories
with no rows yet (so the client never has to special-case a missing key):

```json
{
  "categories": [
    { "category": "vocabulary", "count": 12 },
    { "category": "verb_form", "count": 41 },
    { "category": "agreement", "count": 3 },
    { "category": "grammar_words", "count": 0 },
    { "category": "word_order", "count": 7 },
    { "category": "missing_extra_meaning", "count": 2 },
    { "category": "spelling_accents", "count": 19 },
    { "category": "idiom", "count": 1 },
    { "category": "recall_failure", "count": 25 }
  ]
}
```

Implementation: one `GROUP BY category` query against `review_categorizations`
(`SELECT category, COUNT(*) FROM review_categorizations GROUP BY category`),
then the route merges that result with the fixed nine-category list so
zero-count categories are still present. "Strongest"/"weakest" (lowest/
highest count) is computed client-side from this list — no separate ranking
endpoint.

### `GET /api/categorization/mistakes`

Query params: `category` (required, one of the nine slugs), `cursor`
(optional, opaque string), `limit` (optional, default 50, max 100).

Returns a page of that category's mistakes, newest-first:

```json
{
  "items": [
    {
      "id": 481,
      "category": "agreement",
      "rationale": "la casa blanco should be la casa blanca",
      "keyTerms": ["blanco", "blanca"],
      "correctText": "la casa blanca",
      "submittedText": "la casa blanco",
      "direction": "english-to-spanish",
      "verdict": "incorrect",
      "createdAt": "2026-09-12T14:03:11.000Z"
    }
  ],
  "nextCursor": "2026-09-12T14:03:11.000Z,481"
}
```

- Sort key is `(created_at DESC, id DESC)` — `created_at` alone isn't unique
  enough (a batch insert can share a timestamp down to the millisecond), so
  `id` breaks ties deterministically without ever skipping or repeating a row
  across pages.
- `cursor` is the opaque string `"<createdAt ISO>,<id>"` from the previous
  page's last row; the query filters
  `WHERE (created_at, id) < (:cursorCreatedAt, :cursorId)` (first page omits
  the filter). This is the same keyset-pagination shape already familiar from
  cursor-based APIs elsewhere in the ecosystem — no `OFFSET`, so pages stay
  correct even if new mistakes are inserted between requests.
- `nextCursor` is `null` when the page returned fewer than `limit` rows (no
  more pages).
- 400 if `category` is missing or not one of the nine known slugs.

## Client

### Route & nav

- New route `/mistakes` in `App.tsx`, same auth-gating pattern as the
  existing four routes (`Navigate` to `/login` when anonymous).
- New `client/src/mistakes/MistakesPage.tsx`, following `ProgressPage.tsx`'s
  structure: `loadState` state machine (`loading`/`ready`/`error`), a `load()`
  callback, 401 handling via `onLoggedOut`.

### Category metadata

New `client/src/mistakes/categoryInfo.ts` — a static array of the nine
categories, each with `{ category, label, description, icon }`:

```ts
export const CATEGORY_INFO: CategoryInfo[] = [
  { category: 'vocabulary', label: 'Vocabulary', description: 'Wrong word or confused similar words.', icon: BookOpen },
  { category: 'verb_form', label: 'Verb form', description: 'Right verb, wrong person, tense, or mood.', icon: Repeat },
  { category: 'agreement', label: 'Agreement', description: 'Gender or number mismatch between words.', icon: Link2 },
  { category: 'grammar_words', label: 'Grammar words', description: 'Articles, prepositions, pronouns, ser/estar, por/para.', icon: Puzzle },
  { category: 'word_order', label: 'Word order', description: 'Right words, wrong arrangement.', icon: ArrowLeftRight },
  { category: 'missing_extra_meaning', label: 'Missing/extra meaning', description: 'Information left out, added, or changed.', icon: Scale },
  { category: 'spelling_accents', label: 'Spelling & accents', description: 'Right word, wrong spelling or accent marks.', icon: SpellCheck },
  { category: 'idiom', label: 'Idiom', description: 'Too literal a translation of a natural expression.', icon: MessageSquareQuote },
  { category: 'recall_failure', label: "Didn't recall", description: 'Blank, unrelated, or no usable answer.', icon: HelpCircle },
];
```

(Exact icon choices are picked from `lucide-react` during implementation;
this list fixes the *slugs*, *labels*, and *descriptions*, which are the
parts that must stay consistent with the categorization prompt's meanings.)
New client dependency: `lucide-react` (tree-shakeable, no CSS import, React
19 compatible).

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ header: Mistakes | Learn Train Progress Log out          │
├─────────────────────────────────────────────────────────┤
│  [Vocab]  [VerbForm]  [Agreement]  [Grammar]  [Order]    │  <- category
│  [Meaning] [Spelling]  [Idiom]  [Recall]                 │     card grid
├─────────────────────────────────────────────────────────┤
│  ▾ Verb form (41 mistakes)              [Practice: soon] │  <- expanded
│  ┌───────────┬───────────┬──────────┬────────┬────────┐ │     accordion
│  │ Correct   │ Submitted │ Rationale│ Terms  │ When   │ │
│  ├───────────┼───────────┼──────────┼────────┼────────┤ │
│  │ viajaré   │ viajo     │ ...      │ tags   │ 2h ago │ │
│  └───────────┴───────────┴──────────┴────────┴────────┘ │
│  [Load more]                                             │
└─────────────────────────────────────────────────────────┘
```

- **Category cards**: a responsive grid (`repeat(auto-fill, minmax(...))`,
  matching `.card-grid`'s existing pattern), one card per category, always
  all nine, each showing: icon (large, ~32-40px), `label`, `description`
  (one line), mistake `count` from `/summary`, and a disabled "Practice this
  category" button (`disabled`, `title="Coming soon"` — a real `<button
  disabled>` with a native tooltip, not a custom tooltip component; simplest
  thing that satisfies "grayed out with a tooltip", no new UI primitive
  needed). A category with `count === 0` renders its card in a visually
  muted state (existing `.existing-card`-style treatment) and clicking it
  does nothing (no accordion to open).
- **Selecting a card** (`count > 0`) toggles that category's accordion open/
  closed below the grid; selecting a different card while one is open closes
  the previous one and opens the new one (single-open accordion, not
  multi-open) — keeps "most of the vertical space" available for one
  category at a time, matching the request.
- Opening a category for the first time triggers `GET /mistakes?category=X`
  (no `cursor`); the page caches each category's loaded items + `nextCursor`
  in state so re-opening an already-loaded category doesn't re-fetch.
- **Mistakes table**: columns Correct / Submitted / Rationale / Key terms
  (rendered as small pill badges, reusing the visual language of existing
  tag-like UI if any, otherwise a simple `.key-term-pill` span) / When
  (relative-ish date, same `toLocaleDateString` approach as `ProgressPage`).
  Below the table, a "Load more" button appears whenever `nextCursor !==
  null`, fetching the next page with that cursor and appending.
- Sort: newest-first, exactly as the API returns it — no client-side
  re-sorting.

### Error handling

- `/summary` failing to load shows the same `form-error` + `Retry` pattern as
  `ProgressPage`.
- A given category's `/mistakes` fetch failing shows an inline error inside
  that category's accordion (not a full-page error) with its own retry
  button, so one bad request doesn't blow away the whole page.
- 401 on either endpoint triggers `onLoggedOut()`, same as every other page.

## Testing

- Server: unit tests for the summary query (zero-fill behavior — a category
  with no rows still appears with `count: 0`) and the cursor-pagination query
  (stable ordering across a page boundary, `nextCursor` correctness,
  including the tie-breaking case of two rows sharing a `created_at`).
- Server: route-level tests for the 400 on missing/invalid `category`.
- Client: component test for the category grid rendering all nine categories
  from a mocked `/summary` response, including the zero-count muted state and
  the disabled "Coming soon" button.
- Client: component test for opening a category, rendering its mistakes
  table from a mocked `/mistakes` response, and the "Load more" flow
  appending a second page.

## Out of scope (future work, not this spec)

- The "Practice this category" button's actual behavior (LLM-generated
  practice sentences from a category's accumulated mistakes) — reserved as a
  disabled no-op here only.
- Any change to the categorization job itself (already shipped).
- True accuracy-rate-based strength ranking (mistakes as a fraction of total
  attempts per category) — this dashboard ranks by raw mistake count only,
  since `review_history` isn't currently joinable to a per-category attempt
  total.
