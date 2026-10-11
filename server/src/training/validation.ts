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
  // The text checkAnswerWithAlternates actually diffed against on the
  // client — the primary answer, or whichever alternate matched.
  matchedText: string;
}

export function parseReviewRequest(body: unknown): ReviewRequest | null {
  const { cardId, rating, direction, verdict, submittedText, matchedText } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (
    !Number.isInteger(cardId) ||
    !isReviewRating(rating) ||
    !isPromptDirection(direction) ||
    !isVerdict(verdict) ||
    typeof submittedText !== 'string' ||
    typeof matchedText !== 'string' ||
    matchedText.trim() === ''
  ) {
    return null;
  }
  return { cardId: cardId as number, rating, direction, verdict, submittedText, matchedText };
}

// Upper bound on reviews per request. The client sends at most 25 per chunk;
// this only bounds a hostile or buggy caller.
export const MAX_BATCH_REVIEWS = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One queued review: the review itself plus the client's idempotency key and
// the time the user actually rated the card.
export interface ReviewItem {
  clientReviewId: string;
  reviewedAt: Date;
  request: ReviewRequest;
}

export function parseReviewItem(body: unknown): ReviewItem | null {
  const request = parseReviewRequest(body);
  const { clientReviewId, reviewedAt } = (body ?? {}) as Record<string, unknown>;
  if (
    !request ||
    typeof clientReviewId !== 'string' ||
    !UUID_PATTERN.test(clientReviewId) ||
    typeof reviewedAt !== 'string'
  ) {
    return null;
  }
  const parsedAt = new Date(reviewedAt);
  if (Number.isNaN(parsedAt.getTime())) {
    return null;
  }
  return { clientReviewId, reviewedAt: parsedAt, request };
}

// A batch entry keeps its place even when malformed, so the response can
// report `invalid` for exactly that item without blocking the others.
export interface ParsedReviewEntry {
  clientReviewId: string | null;
  item: ReviewItem | null;
}

export function parseReviewBatch(body: unknown): ParsedReviewEntry[] | null {
  const reviews = (body as { reviews?: unknown } | null | undefined)?.reviews;
  if (!Array.isArray(reviews) || reviews.length === 0 || reviews.length > MAX_BATCH_REVIEWS) {
    return null;
  }
  return reviews.map((raw: unknown) => {
    const item = parseReviewItem(raw);
    const rawId = (raw as { clientReviewId?: unknown } | null | undefined)?.clientReviewId;
    return {
      clientReviewId: item?.clientReviewId ?? (typeof rawId === 'string' ? rawId : null),
      item,
    };
  });
}
