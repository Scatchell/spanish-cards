import type { ReviewBatchItem, ReviewResult, ReviewSubmission } from '../api.js';

// At this many unsynced reviews, rating pauses until the backlog drains. Bounds
// storage use and the damage of a stuck connection.
export const MAX_PENDING_REVIEWS = 50;

// Matches reviews.submitted_text in review_history (varchar(255)).
const MAX_SUBMITTED_TEXT = 255;

export type PendingReview = ReviewBatchItem;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// One outbox per user so a shared device never replays one account's reviews
// under another's session.
export function outboxKey(userKey: string): string {
  return `spanish-cards:review-outbox:${userKey}`;
}

function isPendingReview(value: unknown): value is PendingReview {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.clientReviewId === 'string' &&
    typeof r.reviewedAt === 'string' &&
    typeof r.cardId === 'number' &&
    typeof r.rating === 'string' &&
    typeof r.direction === 'string' &&
    typeof r.verdict === 'string' &&
    typeof r.submittedText === 'string' &&
    typeof r.matchedText === 'string'
  );
}

// Anything unreadable becomes an empty outbox: losing a few unsynced reviews
// is better than crashing training.
export function loadOutbox(storage: KeyValueStorage, key: string): PendingReview[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingReview) : [];
  } catch {
    return [];
  }
}

// Best-effort: the in-memory outbox stays authoritative if storage is full or
// disabled (private mode); only cross-reload persistence is lost.
export function saveOutbox(storage: KeyValueStorage, key: string, reviews: PendingReview[]): void {
  try {
    storage.setItem(key, JSON.stringify(reviews));
  } catch {
    // ignore
  }
}

export function isOutboxFull(reviews: PendingReview[]): boolean {
  return reviews.length >= MAX_PENDING_REVIEWS;
}

// crypto.randomUUID only exists in secure contexts (https/localhost); the app
// is also reached over plain http on the LAN, where getRandomValues still works.
export function newClientReviewId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createPendingReview(
  submission: ReviewSubmission,
  now: Date,
  id: string = newClientReviewId(),
): PendingReview {
  return {
    ...submission,
    submittedText: submission.submittedText.slice(0, MAX_SUBMITTED_TEXT),
    clientReviewId: id,
    reviewedAt: now.toISOString(),
  };
}

// Every status (applied, duplicate, cardNotFound, invalid) means the server is
// done with that review, so the client stops retrying it.
export function settledIds(results: ReviewResult[]): Set<string> {
  const ids = new Set<string>();
  for (const result of results) {
    if (result.clientReviewId !== null) ids.add(result.clientReviewId);
  }
  return ids;
}

export function removeById(reviews: PendingReview[], ids: Set<string>): PendingReview[] {
  return reviews.filter((review) => !ids.has(review.clientReviewId));
}
