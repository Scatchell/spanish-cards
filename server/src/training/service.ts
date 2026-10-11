import type { DbPool } from '../db.js';
import { withTransaction } from '../db.js';
import {
  getEffectiveDue,
  getSchedule,
  insertReview,
  insertReviewHistory,
  upsertSchedule,
} from './repository.js';
import { rateSchedule } from './scheduler.js';
import type { ParsedReviewEntry, ReviewRequest } from './validation.js';

export interface ReviewOutcome {
  due: Date;
  wasDue: boolean;
  // True when this clientReviewId was already recorded; nothing was changed.
  duplicate: boolean;
}

// Applies a review: advances the card's FSRS schedule and appends a review
// history row in one transaction. `now` is the review time (for a replayed
// offline review, the clamped client timestamp). `wasDue` is computed here
// from the card's effective due time — not trusted from the client — so
// extra-practice reviews are recorded honestly. When `clientReviewId` was
// already recorded the call is a no-op and reports `duplicate`. Returns null
// when the card does not exist.
export async function recordReview(
  pool: DbPool,
  userId: number,
  request: ReviewRequest,
  now: Date,
  clientReviewId: string | null = null,
): Promise<ReviewOutcome | null> {
  const effectiveDue = await getEffectiveDue(pool, userId, request.cardId);
  if (effectiveDue === null) {
    return null;
  }
  const wasDue = effectiveDue <= now;
  const detectedCorrect = request.verdict !== 'incorrect';
  const current = await getSchedule(pool, request.cardId);
  const next = rateSchedule(current, request.rating, now);
  // The review row goes first: its unique index is the idempotency gate, so a
  // repeat inserts nothing and must not advance the schedule a second time.
  const inserted = await withTransaction(pool, async (tx) => {
    const wasInserted = await insertReview(tx, {
      cardId: request.cardId,
      direction: request.direction,
      detectedCorrect,
      rating: request.rating,
      wasDue,
      reviewedAt: now,
      clientReviewId,
    });
    if (wasInserted) {
      await upsertSchedule(tx, request.cardId, next);
    }
    return wasInserted;
  });
  if (!inserted) {
    return { due: current?.due ?? effectiveDue, wasDue, duplicate: true };
  }

  // Best-effort, supplementary capture: must never fail or roll back the
  // review above. correctText is the alternate-aware match the client
  // actually diffed against (primary, or a matched alternate) — see
  // checkAnswerWithAlternates. Both text fields are defensively capped to
  // their column widths so an over-long string can never throw and lose the
  // row.
  try {
    await insertReviewHistory(pool, {
      userId,
      cardId: request.cardId,
      direction: request.direction,
      verdict: request.verdict,
      rating: request.rating,
      correctText: request.matchedText.slice(0, 70),
      submittedText: request.submittedText.slice(0, 255),
      attemptedAt: now,
    });
  } catch (err) {
    console.error('Review history capture failed:', err);
  }

  return { due: next.due, wasDue, duplicate: false };
}

// How far back a client-supplied review time is trusted. Keeps a wrong
// device clock from rewriting history or scheduling reviews in the future.
export const MAX_BACKDATE_MS = 7 * 24 * 60 * 60 * 1000;

export function clampReviewedAt(reviewedAt: Date, serverNow: Date): Date {
  const earliest = new Date(serverNow.getTime() - MAX_BACKDATE_MS);
  if (reviewedAt > serverNow) {
    return serverNow;
  }
  if (reviewedAt < earliest) {
    return earliest;
  }
  return reviewedAt;
}

export type ReviewResultStatus = 'applied' | 'duplicate' | 'cardNotFound' | 'invalid';

export interface ReviewResult {
  clientReviewId: string | null;
  status: ReviewResultStatus;
}

// Replays a batch of queued reviews oldest-first (FSRS is order-dependent),
// each at its clamped client time. Results line up with `entries`. A thrown
// DB error aborts the request; the client re-sends and already-applied items
// come back as `duplicate`.
export async function recordReviewBatch(
  pool: DbPool,
  userId: number,
  entries: ParsedReviewEntry[],
  serverNow: Date,
): Promise<ReviewResult[]> {
  const results: ReviewResult[] = entries.map((entry) => ({
    clientReviewId: entry.clientReviewId,
    status: 'invalid',
  }));
  const order = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.item !== null)
    .sort(
      (a, b) =>
        a.entry.item!.reviewedAt.getTime() - b.entry.item!.reviewedAt.getTime() || a.index - b.index,
    );
  for (const { entry, index } of order) {
    const item = entry.item!;
    const outcome = await recordReview(
      pool,
      userId,
      item.request,
      clampReviewedAt(item.reviewedAt, serverNow),
      item.clientReviewId,
    );
    results[index]!.status =
      outcome === null ? 'cardNotFound' : outcome.duplicate ? 'duplicate' : 'applied';
  }
  return results;
}
