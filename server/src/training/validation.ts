import { isReviewRating } from './scheduler.js';
import type { ReviewRating } from './scheduler.js';

export const PROMPT_DIRECTIONS = ['spanish-to-english', 'english-to-spanish'] as const;
export type PromptDirection = (typeof PROMPT_DIRECTIONS)[number];

export function isPromptDirection(value: unknown): value is PromptDirection {
  return typeof value === 'string' && (PROMPT_DIRECTIONS as readonly string[]).includes(value);
}

export const VERDICTS = ['correct', 'correctWithDifferences', 'incorrect'] as const;
export type Verdict = (typeof VERDICTS)[number];

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value);
}

// A validated review submission. The three-state `verdict` is the
// answer-checker's result; `detectedCorrect` is derived from it server-side.
// `submittedText` is the raw text the user typed (may be empty). Whether the
// review counted as due or extra practice is decided server-side, not trusted
// from the client.
export interface ReviewRequest {
  cardId: number;
  rating: ReviewRating;
  direction: PromptDirection;
  verdict: Verdict;
  submittedText: string;
}

export function parseReviewRequest(body: unknown): ReviewRequest | null {
  const { cardId, rating, direction, verdict, submittedText } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (
    !Number.isInteger(cardId) ||
    !isReviewRating(rating) ||
    !isPromptDirection(direction) ||
    !isVerdict(verdict) ||
    typeof submittedText !== 'string'
  ) {
    return null;
  }
  return { cardId: cardId as number, rating, direction, verdict, submittedText };
}
