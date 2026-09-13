import { PRACTICE_MODEL } from './generator.js';
import type { PracticeSentenceGenerator } from './generator.js';
import type { MistakeDetail, NewPracticeSession, PracticeExample, PracticeSession } from './repository.js';

export type GenerateResult =
  | { status: 'ok'; session: PracticeSession }
  | { status: 'unavailable' }
  | { status: 'not_found' };

export interface PracticeServiceDeps {
  getMistakeContext: (reviewCategorizationId: number) => Promise<MistakeDetail | null>;
  selectPracticeExamples: (reviewCategorizationId: number) => Promise<PracticeExample[]>;
  generate: PracticeSentenceGenerator | null;
  upsertPracticeSession: (input: NewPracticeSession) => Promise<PracticeSession>;
}

// Same operation for "generate for the first time" and "regenerate": the
// repository upsert (Task 4) always overwrites, so there is no separate
// force-regenerate branch here.

// Dedupes concurrent callers (e.g. StrictMode double-mount, rapid modal
// reopen) onto one in-flight generation per mistake, avoiding duplicate paid
// LLM calls. Entries are removed once the generation settles.
const inFlight = new Map<number, Promise<GenerateResult>>();

export async function generatePracticeSession(
  deps: PracticeServiceDeps,
  reviewCategorizationId: number,
): Promise<GenerateResult> {
  const existing = inFlight.get(reviewCategorizationId);
  if (existing) {
    return existing;
  }

  const promise = runGeneration(deps, reviewCategorizationId).finally(() => {
    inFlight.delete(reviewCategorizationId);
  });
  inFlight.set(reviewCategorizationId, promise);
  return promise;
}

async function runGeneration(
  deps: PracticeServiceDeps,
  reviewCategorizationId: number,
): Promise<GenerateResult> {
  if (!deps.generate) {
    return { status: 'unavailable' };
  }

  const target = await deps.getMistakeContext(reviewCategorizationId);
  if (!target) {
    return { status: 'not_found' };
  }

  const examples = await deps.selectPracticeExamples(reviewCategorizationId);
  const sentences = await deps.generate({ target, examples });
  const session = await deps.upsertPracticeSession({
    reviewCategorizationId,
    model: PRACTICE_MODEL,
    generatedAt: new Date().toISOString(),
    examples,
    sentences,
  });

  return { status: 'ok', session };
}
