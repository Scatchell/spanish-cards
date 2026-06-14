---
type: plan
id: "2026-06-15-explain-quick-chat"
title: "Explain Quick Chat Implementation Plan"
date: "2026-06-14T22:14:37+00:00"
author: "Anthony Scatchell"
producer: create-plan
status: draft
work_item_id: ""
parent: ""
reviewer: ""
tags: []
revision: "bff999b7d8d5e035ac7aa0e6506facde022fc81f"
repository: "spanish-cards"
last_updated: "2026-06-14T22:14:37+00:00"
last_updated_by: "Anthony Scatchell"
schema_version: 1
---

# Explain Quick Chat Implementation Plan

## Overview

Add a one-shot follow-up question box inside the existing explanation modal.
After the initial explanation is shown (generated or cached), the user can type
a specific language question about the sentence (e.g. "Why is *fui* used here
instead of *estaba*?"). The LLM answers concisely with the full explanation +
card text as context. Answers are not persisted, no conversation history is
kept — each question is independent and replaces the previous answer.

## Current State Analysis

The explain feature is fully built and stops at displaying a static
explanation:

- **Modal** (`client/src/explain/ExplanationModal.tsx`) fetches one explanation
  on mount via `fetchExplanation(cardId)`, renders `contentMarkdown` with
  `ReactMarkdown`. It has three states: `loading | ready | error`. No input.
- **API client** (`client/src/api.ts:139`) exposes `fetchExplanation` →
  `POST /api/cards/:id/explanation`.
- **Route** (`server/src/explanations/routes.ts`) validates the card id, guards
  on `languagePair === 'en<->es'`, then delegates to `getOrCreateExplanation`.
- **Service** (`server/src/explanations/service.ts`) implements cache-or-generate
  (the follow-up will NOT use this — it always generates, never caches).
- **LLM** (`server/src/explanations/llm.ts`) wraps the OpenAI Responses API with
  a fixed `INSTRUCTIONS` system prompt, `max_output_tokens: 600`,
  `reasoning: { effort: 'none' }`, model `gpt-5.4-mini`. Exposes
  `createExplanationGenerator(config)` returning a generator or `null` when no
  key is configured.
- **e2e stub** (`e2e/openai-stub.ts`) is a tiny HTTP server matching
  `POST /responses`, echoing a stubbed `output_text`, with a
  `TRIGGER-EXPLAIN-FAILURE` input sentinel for the error path. It counts
  requests for cache-assertion tests.

### Key Discoveries:

- The LLM module already abstracts the OpenAI call cleanly; a second generator
  function (`createFollowUpGenerator`) can live alongside the existing one and
  reuse the same client construction pattern (`server/src/explanations/llm.ts:21-45`).
- The route file already supports `overrides` dependency injection for tests
  (`server/src/explanations/routes.ts:9-19`) — the new endpoint should follow
  the same shape so it stays unit-testable without a live OpenAI.
- The follow-up does **not** touch the DB at all: no repository call, no
  migration. It only needs the card text (for the guard + context) and the
  client-supplied explanation markdown + question.
- The modal already manages discrete UI states and an `AbortController`
  (`ExplanationModal.tsx:18-30`); the follow-up adds a parallel, independent
  request lifecycle that must cancel an in-flight follow-up when a new one is
  submitted or the modal closes.
- The error copy and `role="alert"` pattern (`ExplanationModal.tsx:65-69`) and
  the `getByRole('dialog')` / `Close` button conventions are what the e2e specs
  assert against — reuse the same idioms.
- The e2e stub currently ignores the `instructions` field and always returns the
  same body. To assert the follow-up answer is distinct from the explanation,
  the stub should branch its response text on a marker in the `input` (the
  follow-up input will contain the user's question).

## Desired End State

In the explanation modal, below the rendered explanation, there is a text input
("Ask a question about this sentence…") with a submit affordance. When the user
submits:

1. The previous answer (if any) stays visible with a loading indicator.
2. On success, the answer area shows:
   ```
   Question they asked
   ───────────────────
   Markdown-rendered answer from the LLM
   ```
3. The input box clears, ready for another independent question.
4. A muted hint near the input reads something like *"Each question is
   independent — conversation history isn't stored."*

Answers are capped (`max_output_tokens: 300`), markdown-rendered, never saved.
Submitting a second question replaces the first answer entirely.

Verification: e2e test types a question, asserts the answer block shows both the
question text and a follow-up-specific stubbed answer; types a second question
and asserts the first answer is replaced; asserts no DB persistence by reopening
the modal and confirming the follow-up area is empty again.

## What We're NOT Doing

- No conversation history / multi-turn memory (each call is one-shot).
- No persistence of follow-up Q&A (no DB table, no migration, no repository
  changes).
- No caching of follow-up answers (always a fresh generation).
- No streaming responses (single response, consistent with the existing
  explanation call).
- No changes to the initial explanation generation, its prompt, caching, or the
  `explanations` table.
- No rate-limiting beyond the existing `/api` limiter already mounted in
  `app.ts:43`.
- No changes to `LearnPage`/`TrainPage` keyboard handling beyond what already
  exists (the modal owns its own input focus/escape behaviour).

## Implementation Approach

Mirror the existing explanation vertical slice (LLM generator → service-free
route → API client → modal UI), but as a stateless generate-only path. Backend
first (new generator + endpoint + unit tests), then API client, then modal UI,
then e2e + stub update. The follow-up endpoint receives the card id (for the
language-pair guard and authoritative card text) plus the explanation markdown
and the user's question from the client, and returns a freshly generated answer.

Passing the explanation markdown from the client (rather than re-fetching it
server-side) keeps the endpoint stateless and avoids a second cache lookup; the
card text is still re-derived server-side from the card id so the guard and
context can't be spoofed into explaining a non-`en<->es` card.

## Phase 1: Backend — follow-up generator

### Overview

Add a second generator to the LLM module that answers a focused question using a
concise, language-only system prompt, capped at 300 output tokens.

### Changes Required:

#### 1. Follow-up generator

**File**: `server/src/explanations/llm.ts`
**Changes**: Add `FollowUpGenerator` type, a follow-up system prompt, and
`createFollowUpGenerator(config)` reusing the same client construction. Keep the
existing explanation generator untouched.

```ts
export type FollowUpGenerator = (input: {
  spanishText: string;
  englishText: string;
  explanationMarkdown: string;
  question: string;
}) => Promise<string>;

const FOLLOWUP_INSTRUCTIONS = [
  'You are a concise Spanish language tutor answering a single follow-up question',
  'about one specific flashcard sentence. You are given the Spanish text, its',
  'English translation, the explanation already shown to the learner, and their',
  'question.',
  'Answer ONLY that question, strictly about the Spanish language content shown',
  '(grammar, word choice, tense, alternatives, nuance).',
  'Do not introduce unrelated vocabulary or new sentences to study.',
  'Be brief and scannable: a few short sentences or up to ~4 bullets, no preamble,',
  'no headings. Respond in GitHub-flavored markdown.',
  'If the question is not about this sentence or about Spanish, briefly say you can',
  'only help with this sentence.',
].join(' ');

export function createFollowUpGenerator(config: AppConfig): FollowUpGenerator | null {
  if (!config.openaiSecretKey) {
    return null;
  }
  const client = new OpenAI({
    apiKey: config.openaiSecretKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    timeout: 20_000,
    maxRetries: 1,
  });
  return async ({ spanishText, englishText, explanationMarkdown, question }) => {
    const response = await client.responses.create({
      model: EXPLANATION_MODEL,
      instructions: FOLLOWUP_INSTRUCTIONS,
      input: [
        `Spanish: ${spanishText}`,
        `English translation: ${englishText}`,
        `Explanation already shown:\n${explanationMarkdown}`,
        `Learner's question: ${question}`,
      ].join('\n\n'),
      max_output_tokens: 300,
      reasoning: { effort: 'none' },
    });
    const text = response.output_text?.trim();
    if (!text) {
      throw new Error('Empty follow-up answer from model');
    }
    return text;
  };
}
```

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`
- [x] Unit tests pass: `pnpm test`

#### Manual Verification:

- [x] N/A for this phase (covered by later phases).

---

## Phase 2: Backend — follow-up endpoint

### Overview

Add `POST /api/cards/:id/explanation/follow-up` accepting `{ question }` and the
explanation markdown, guarded the same way as the explanation route, returning a
freshly generated answer. No caching, no DB writes.

### Changes Required:

#### 1. Route

**File**: `server/src/explanations/routes.ts`
**Changes**: Add a second handler on the same router. Validate the id (reuse the
existing pattern), load the card, enforce `languagePair === 'en<->es'`, validate
the request body (`question` non-empty and length-capped; `explanationMarkdown`
present and length-capped), and call the injected follow-up generator. Return
`502` when the generator is `null` (mirrors the explanation `unavailable`
behaviour) and `502` on generation failure.

Add `followUp: FollowUpGenerator | null` as a parameter to `explanationRoutes`,
threaded from `app.ts`. Add an override hook in `ExplanationRouteDeps` for tests
(e.g. `followUp?`), consistent with existing DI.

```ts
const MAX_QUESTION_CHARS = 500;
const MAX_CONTEXT_CHARS = 4000;

router.post('/:id/explanation/follow-up', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Card id must be a positive integer' });
    return;
  }
  const { question, explanationMarkdown } = (req.body ?? {}) as {
    question?: unknown;
    explanationMarkdown?: unknown;
  };
  if (typeof question !== 'string' || question.trim().length === 0) {
    res.status(400).json({ error: 'A question is required' });
    return;
  }
  if (question.length > MAX_QUESTION_CHARS) {
    res.status(400).json({ error: 'Question is too long' });
    return;
  }
  if (typeof explanationMarkdown !== 'string' || explanationMarkdown.length > MAX_CONTEXT_CHARS) {
    res.status(400).json({ error: 'Invalid explanation context' });
    return;
  }

  const card = await deps.getCard(id);
  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }
  if (card.languagePair !== 'en<->es') {
    res.status(400).json({ error: 'Explanations are not supported for this card type' });
    return;
  }
  const generate = overrides?.followUp ?? followUp;
  if (!generate) {
    res.status(502).json({ error: 'Explanation generation is not configured' });
    return;
  }
  try {
    const answerMarkdown = await generate({
      spanishText: card.spanishText,
      englishText: card.englishText,
      explanationMarkdown,
      question: question.trim(),
    });
    res.json({ answerMarkdown });
  } catch (err) {
    console.error('Follow-up generation failed:', err);
    res.status(502).json({ error: 'Follow-up generation failed' });
  }
});
```

#### 2. Wire the generator in app.ts

**File**: `server/src/app.ts`
**Changes**: Construct the follow-up generator and pass it to
`explanationRoutes`.

```ts
import { createExplanationGenerator, createFollowUpGenerator } from './explanations/llm.js';
// ...
app.use(
  '/api/cards',
  requireAuth(config),
  explanationRoutes(pool, createExplanationGenerator(config), createFollowUpGenerator(config)),
);
```

#### 3. Unit tests

**File**: `server/src/explanations/routes.test.ts` (extend existing, or add if
none) — follow whatever pattern the existing explanation route tests use.
**Changes**: Cover: success (returns `answerMarkdown` from an injected stub
generator); missing/empty question → 400; oversized question → 400; oversized
context → 400; non-`en<->es` card → 400; unknown card → 404; `null` generator →
502; generator throw → 502.

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`
- [x] Unit tests pass: `pnpm test`

#### Manual Verification:

- [ ] `curl -X POST` against a dev card returns a sensible short answer (with a
      real key configured), and 400/502 paths behave as specified.

---

## Phase 3: API client

### Overview

Add a typed client function for the follow-up endpoint.

### Changes Required:

#### 1. Client function

**File**: `client/src/api.ts`
**Changes**: Add after `fetchExplanation` (`api.ts:139`):

```ts
export interface FollowUpResponse {
  answerMarkdown: string;
}

export function askFollowUp(
  cardId: number,
  question: string,
  explanationMarkdown: string,
  signal?: AbortSignal,
): Promise<FollowUpResponse> {
  return request(`/api/cards/${cardId}/explanation/follow-up`, {
    method: 'POST',
    body: JSON.stringify({ question, explanationMarkdown }),
    signal,
  });
}
```

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`

---

## Phase 4: Modal UI

### Overview

Add the follow-up input, the answer block (question header + divider + rendered
answer), the loading-over-previous-answer behaviour, and the muted independence
hint. Only show the follow-up section once the initial explanation is `ready`.

### Changes Required:

#### 1. Modal component

**File**: `client/src/explain/ExplanationModal.tsx`
**Changes**: Add follow-up state and handlers:

- State: `question` (input value), `askedQuestion` (the question tied to the
  current answer), `answerMarkdown`, and a follow-up status
  `idle | asking | error`.
- Keep an `AbortController` ref for the in-flight follow-up; abort it on new
  submit and on unmount.
- On submit (Enter in the input or the submit button), with non-empty trimmed
  question: set status `asking`, keep any existing `answerMarkdown` visible, call
  `askFollowUp(cardId, question, markdown)`. On success set `askedQuestion`,
  `answerMarkdown`, clear the input, status `idle`. On error set status `error`
  (keep prior answer visible). Ignore `AbortError`.
- Render the follow-up section only when `state === 'ready'`.
- The answer block renders `askedQuestion` as a header above a divider, then
  `<ReactMarkdown>{answerMarkdown}</ReactMarkdown>`. While `asking`, show a
  subtle loading indicator alongside/over the existing answer.
- Muted hint text below the input: "Each question is independent — conversation
  history isn't stored."
- Submit-on-Enter must `stopPropagation` so it doesn't collide with the modal's
  capture-phase Escape handler or page-level shortcuts; Escape still closes the
  modal.

Sketch:

```tsx
{state === 'ready' && (
  <div className="explanation-followup">
    {askedQuestion && (
      <div className="followup-answer" aria-live="polite">
        <p className="followup-question">{askedQuestion}</p>
        <hr className="followup-divider" />
        <ReactMarkdown>{answerMarkdown}</ReactMarkdown>
        {followUpState === 'asking' && (
          <p className="hint followup-loading">Thinking…</p>
        )}
      </div>
    )}
    {!askedQuestion && followUpState === 'asking' && (
      <p className="hint followup-loading">Thinking…</p>
    )}
    {followUpState === 'error' && (
      <p className="form-error" role="alert">
        Sorry! Couldn’t answer that one — try again.
      </p>
    )}
    <form className="followup-form" onSubmit={handleAsk}>
      <input
        type="text"
        className="followup-input"
        placeholder="Ask a question about this sentence…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Ask a question about this sentence"
      />
      <button type="submit" disabled={followUpState === 'asking' || !question.trim()}>
        Ask
      </button>
    </form>
    <p className="hint followup-disclaimer">
      Each question is independent — conversation history isn’t stored.
    </p>
  </div>
)}
```

#### 2. Styles

**File**: wherever the existing `.explanation-modal` styles live (find the CSS
that defines `.explanation-modal-body`, `.explanation-spanish`, etc.).
**Changes**: Add styles for `.explanation-followup`, `.followup-form` (input +
button row), `.followup-question` (slightly emphasised), `.followup-divider`,
`.followup-loading`, and `.followup-disclaimer` (muted). Ensure the modal body
scrolls rather than growing unbounded on mobile so a long answer + input stay
usable.

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `pnpm typecheck`
- [x] Unit tests pass: `pnpm test`

#### Manual Verification:

- [ ] Submitting a question shows "Question / divider / answer" and clears the
      input.
- [ ] Submitting a second question keeps the first answer visible with a loading
      indicator, then replaces it.
- [ ] Escape still closes the modal; typing in the input does not trigger
      page-level shortcuts (e.g. rating keys) or advance the card.
- [ ] Layout is usable on a narrow (mobile-width) viewport; long answers scroll.
- [ ] Error path shows a friendly message and leaves the prior answer intact.

---

## Phase 5: e2e coverage + stub

### Overview

Make the stub return a distinct answer for follow-up calls and add a Playwright
test for the follow-up flow.

### Changes Required:

#### 1. Stub branches on follow-up input

**File**: `e2e/openai-stub.ts`
**Changes**: In the `/responses` handler, branch the `output_text` on a marker
present in follow-up requests. The follow-up `input` contains
`Learner's question:` — return a distinct text (e.g.
`- **stubbed** follow-up answer`) when that substring is present, so the test can
distinguish it from the explanation body. Keep the `TRIGGER-EXPLAIN-FAILURE`
behaviour. Optionally echo part of the question to assert context flows through.

```ts
const isFollowUp = typeof parsed.input === 'string' && parsed.input.includes("Learner's question:");
const text = isFollowUp ? '- **stubbed** follow-up answer' : '- **stubbed** explanation for e2e';
```

#### 2. e2e test

**File**: `e2e/explain.spec.ts`
**Changes**: Add a test:

1. Create a card, train, check answer, open the modal, wait for the explanation.
2. Fill the follow-up input with "Why this tense?" and submit (button or Enter).
3. Assert the answer block contains the question text "Why this tense?" and the
   follow-up stub answer ("follow-up answer"), and that the input is now empty.
4. Submit a second question "Another option?"; assert the answer block now shows
   the second question and the first question text is gone (replaced).
5. Close and reopen the modal; assert the follow-up answer area is empty (not
   persisted).

### Success Criteria:

#### Automated Verification:

- [x] e2e suite passes: `pnpm e2e` (new follow-up test passes; 2 pre-existing failures unrelated to this feature)
- [x] Type checking passes: `pnpm typecheck`

#### Manual Verification:

- [ ] N/A — covered by the e2e test.

---

## Testing Strategy

### Unit Tests:

- Route handler: success, validation (empty/oversized question, oversized/missing
  context), card guards (404, wrong language pair), generator unavailable (502),
  generator throw (502). Inject a fake `followUp` generator via overrides.

### Integration / e2e Tests:

- Full modal flow: ask → answer block renders question + answer + input clears;
  second question replaces first; reopening modal shows no persisted follow-up.

### Manual Testing Steps:

1. With a real `OPENAI_SECRET_KEY` in dev `.env`, run `pnpm dev`, train an
   `en<->es` card, open Explain, ask "Why is *fui* used here instead of
   *estaba*?" and confirm a concise, on-topic, markdown answer (≤ ~300 tokens).
2. Ask a second question and confirm replacement + input clears + loading shows
   over the old answer.
3. Ask an off-topic question ("What's the weather?") and confirm the model
   politely declines to leave the sentence's scope.
4. Verify on a mobile-width viewport that the modal scrolls and stays usable.

## Performance Considerations

Each follow-up is a single OpenAI call capped at 300 output tokens with
`reasoning: { effort: 'none' }` and a 20s client timeout — comparable to or
cheaper than the existing explanation call. No DB load (no read/write). The
existing `/api` rate limiter applies.

## Migration Notes

None — no schema or data changes.

## References

- Original idea: `meta/ideas/explain-translations.md`
- Prior explain plan: `meta/plans/2026-06-12-explain-translations.md`
- LLM module: `server/src/explanations/llm.ts:21-45`
- Explanation route (DI pattern): `server/src/explanations/routes.ts:9-19`
- Modal: `client/src/explain/ExplanationModal.tsx`
- e2e stub + specs: `e2e/openai-stub.ts`, `e2e/explain.spec.ts`
