import { isReviewRating } from './scheduler.js';
import type { ReviewRating } from './scheduler.js';

export const PROMPT_DIRECTIONS = ['spanish-to-english', 'english-to-spanish'] as const;
export type PromptDirection = (typeof PROMPT_DIRECTIONS)[number];

export function isPromptDirection(value: unknown): value is PromptDirection {
  return typeof value === 'string' && (PROMPT_DIRECTIONS as readonly string[]).includes(value);
}

// A validated review submission. `detectedCorrect` is the answer-checker's
// verdict before any manual rating override; whether the review counted as
// due or extra practice is decided server-side, not trusted from the client.
export interface ReviewRequest {
  cardId: number;
  rating: ReviewRating;
  direction: PromptDirection;
  detectedCorrect: boolean;
}

export function parseReviewRequest(body: unknown): ReviewRequest | null {
  const { cardId, rating, direction, detectedCorrect } = (body ?? {}) as Record<string, unknown>;
  if (
    !Number.isInteger(cardId) ||
    !isReviewRating(rating) ||
    !isPromptDirection(direction) ||
    typeof detectedCorrect !== 'boolean'
  ) {
    return null;
  }
  return { cardId: cardId as number, rating, direction, detectedCorrect };
}
