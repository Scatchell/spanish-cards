import type { CategoryMistake } from '../categorization/dashboard-repository.js';
import { getRecentMistakes } from '../categorization/dashboard-repository.js';
import type { DbPool } from '../db.js';
import { countDueCards } from '../training/repository.js';
import { computeActivity } from './activity.js';
import type { ActivitySummary, ActivityTrend } from './activity.js';
import { MASTERED_STABILITY_DAYS, computeDeckBreakdown } from './deck.js';
import type { DeckBreakdown } from './deck.js';
import { countDeckBuckets, getAllReviews, getCardCreatedAts } from './repository.js';

const RECENT_MISTAKE_LIMIT = 5;

// Everything the progress page shows, as one plain object. Keeping it a single
// structure means a later feature can pass it whole to an LLM for guidance.
export interface ProgressReport {
  generatedAt: string;
  tzOffsetMinutes: number;
  summary: ActivitySummary;
  trend: ActivityTrend;
  deck: DeckBreakdown & { dueNow: number };
  recentMistakes: CategoryMistake[];
}

export async function buildProgressReport(
  pool: DbPool,
  userId: number,
  now: Date,
  tzOffsetMinutes: number,
): Promise<ProgressReport> {
  const [reviews, cardCreatedAts, bucketRows, dueNow, recentMistakes] = await Promise.all([
    getAllReviews(pool, userId),
    getCardCreatedAts(pool, userId),
    countDeckBuckets(pool, userId, MASTERED_STABILITY_DAYS),
    countDueCards(pool, userId, now),
    getRecentMistakes(pool, userId, RECENT_MISTAKE_LIMIT),
  ]);
  const { summary, trend } = computeActivity({ reviews, cardCreatedAts }, now, tzOffsetMinutes);
  return {
    generatedAt: now.toISOString(),
    tzOffsetMinutes,
    summary,
    trend,
    deck: { ...computeDeckBreakdown(bucketRows), dueNow },
    recentMistakes,
  };
}
