import type { Explanation, NewExplanation } from './repository.js';
import { EXPLANATION_MODEL } from './llm.js';
import type { ExplanationGenerator } from './llm.js';
import { PROMPT_VERSION } from '../prompt-version.js';

export interface ExplanationDeps {
  findExplanation: (spanish: string, english: string) => Promise<Explanation | null>;
  upsertExplanation: (input: NewExplanation) => Promise<Explanation>;
  generate: ExplanationGenerator | null;
}

export type ExplanationResult =
  | { status: 'ok'; explanation: Explanation; source: 'cached' | 'generated' }
  | { status: 'unavailable' };

export async function getOrCreateExplanation(
  deps: ExplanationDeps,
  spanishText: string,
  englishText: string,
): Promise<ExplanationResult> {
  const cached = await deps.findExplanation(spanishText, englishText);
  if (cached) {
    return { status: 'ok', explanation: cached, source: 'cached' };
  }
  if (!deps.generate) {
    return { status: 'unavailable' };
  }
  const contentMarkdown = await deps.generate(spanishText, englishText);
  const explanation = await deps.upsertExplanation({
    spanishText,
    englishText,
    contentMarkdown,
    model: EXPLANATION_MODEL,
    promptVersion: PROMPT_VERSION,
  });
  return { status: 'ok', explanation, source: 'generated' };
}
