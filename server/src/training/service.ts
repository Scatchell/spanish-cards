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
import type { ReviewRequest } from './validation.js';

export interface ReviewOutcome {
  due: Date;
  wasDue: boolean;
}

// Applies a review: advances the card's FSRS schedule and appends a review
// history row in one transaction. `wasDue` is computed here from the card's
// effective due time — not trusted from the client — so extra-practice
// reviews are recorded honestly. Returns null when the card does not exist.
export async function recordReview(
  pool: DbPool,
  request: ReviewRequest,
  now: Date,
): Promise<ReviewOutcome | null> {
  const effectiveDue = await getEffectiveDue(pool, request.cardId);
  if (effectiveDue === null) {
    return null;
  }
  const wasDue = effectiveDue <= now;
  const detectedCorrect = request.verdict !== 'incorrect';
  const current = await getSchedule(pool, request.cardId);
  const next = rateSchedule(current, request.rating, now);
  await withTransaction(pool, async (tx) => {
    await upsertSchedule(tx, request.cardId, next);
    await insertReview(tx, {
      cardId: request.cardId,
      direction: request.direction,
      detectedCorrect,
      rating: request.rating,
      wasDue,
      reviewedAt: now,
    });
  });

  // Best-effort, supplementary capture: must never fail or roll back the
  // review above. correctText is the alternate-aware match the client
  // actually diffed against (primary, or a matched alternate) — see
  // checkAnswerWithAlternates. Submitted text is defensively capped to the
  // column width so an over-long string can never throw and lose the row.
  try {
    await insertReviewHistory(pool, {
      cardId: request.cardId,
      direction: request.direction,
      verdict: request.verdict,
      rating: request.rating,
      correctText: request.matchedText,
      submittedText: request.submittedText.slice(0, 255),
      attemptedAt: now,
    });
  } catch (err) {
    console.error('Review history capture failed:', err);
  }

  return { due: next.due, wasDue };
}
