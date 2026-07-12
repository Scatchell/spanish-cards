import { EXPLANATION_MODEL } from './llm.js';
import type { AnswerCheckGenerator } from './llm.js';
import { normalizeSubmitted } from './normalize.js';
import type {
  AnswerCheck,
  AnswerCheckDirection,
  AnswerCheckKey,
  NewAnswerCheck,
} from './answer-check-repository.js';

export interface AnswerCheckDeps {
  findAnswerCheck: (key: AnswerCheckKey) => Promise<AnswerCheck | null>;
  insertAnswerCheck: (input: NewAnswerCheck) => Promise<AnswerCheck>;
  generate: AnswerCheckGenerator | null;
}

export type AnswerCheckResult =
  | { status: 'ok'; answerCheck: AnswerCheck; source: 'cached' | 'generated' }
  | { status: 'unavailable' };

export async function getOrCreateAnswerCheck(
  deps: AnswerCheckDeps,
  input: {
    spanishText: string;
    englishText: string;
    direction: AnswerCheckDirection;
    submittedAnswer: string;
  },
): Promise<AnswerCheckResult> {
  const { spanishText, englishText, direction, submittedAnswer } = input;
  const submittedNormalized = normalizeSubmitted(submittedAnswer);

  const key: AnswerCheckKey = { spanishText, englishText, direction, submittedNormalized };
  const cached = await deps.findAnswerCheck(key);
  if (cached) {
    return { status: 'ok', answerCheck: cached, source: 'cached' };
  }

  if (!deps.generate) {
    return { status: 'unavailable' };
  }

  // The prompt is the side shown to the learner; the expected answer is what
  // the card stores for the direction being tested.
  const promptText = direction === 'spanish-to-english' ? spanishText : englishText;
  const expectedAnswer = direction === 'spanish-to-english' ? englishText : spanishText;

  const output = await deps.generate({ promptText, expectedAnswer, submittedAnswer });
  const answerCheck = await deps.insertAnswerCheck({
    spanishText,
    englishText,
    direction,
    submittedNormalized,
    verdict: output.verdict,
    suggestedAnswer: output.suggestedAnswer,
    critiqueMarkdown: output.critiqueMarkdown,
    model: EXPLANATION_MODEL,
  });
  return { status: 'ok', answerCheck, source: 'generated' };
}
