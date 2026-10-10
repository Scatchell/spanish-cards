import type { CategoryMistake } from '../categorization/dashboard-repository.js';
import { getRecentMistakes } from '../categorization/dashboard-repository.js';
import type { DbPool } from '../db.js';
import { countDueCards } from '../training/repository.js';
import { computeActivity } from './activity.js';
import type { Activity, ActivitySummary, ActivityTrend } from './activity.js';
import { MASTERED_STABILITY_DAYS, computeDeckBreakdown } from './deck.js';
import type { DeckBreakdown } from './deck.js';
import { countDeckBuckets, getAllReviews, getCardCreatedAts } from './repository.js';

export const RECENT_MISTAKE_LIMIT = 5;

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

export function assembleReport(
  parts: { activity: Activity; deck: DeckBreakdown; dueNow: number; recentMistakes: CategoryMistake[] },
  now: Date,
  tzOffsetMinutes: number,
): ProgressReport {
  return {
    generatedAt: now.toISOString(),
    tzOffsetMinutes,
    summary: parts.activity.summary,
    trend: parts.activity.trend,
    deck: { ...parts.deck, dueNow: parts.dueNow },
    recentMistakes: parts.recentMistakes,
  };
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
  return assembleReport(
    {
      activity: computeActivity({ reviews, cardCreatedAts }, now, tzOffsetMinutes),
      deck: computeDeckBreakdown(bucketRows),
      dueNow,
      recentMistakes,
    },
    now,
    tzOffsetMinutes,
  );
}
