import type { DbQueryable } from '../db.js';
import { dedupKey } from './normalize.js';
import type { MistakeDetail, PracticeExample } from './repository.js';
import {
  findTier1Candidates,
  findTier2Candidates,
  findTier3Candidates,
  findTier4Candidates,
  getMistakeContext,
} from './repository.js';

export const EXAMPLE_LIMIT = 10;
export const TIER4_SAMPLE_SIZE = 15;

interface TieredCandidates {
  tier: 1 | 2 | 3 | 4;
  candidates: MistakeDetail[];
}

// Pure fill-order + dedup logic, deliberately separated from all DB access
// (see selectPracticeExamples below) so it can be unit tested with fabricated
// candidate lists and tweaked without touching a database.
export function composeExamples(
  tiers: TieredCandidates[],
  limit: number = EXAMPLE_LIMIT,
): PracticeExample[] {
  const seen = new Set<string>();
  const result: PracticeExample[] = [];

  for (const { tier, candidates } of tiers) {
    for (const candidate of candidates) {
      if (result.length >= limit) {
        return result;
      }
      const key = dedupKey(candidate.correctText, candidate.submittedText);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({ ...candidate, tier });
    }
  }

  return result;
}

export async function selectPracticeExamples(
  db: DbQueryable,
  reviewCategorizationId: number,
): Promise<PracticeExample[]> {
  const context = await getMistakeContext(db, reviewCategorizationId);
  if (!context) {
    throw new Error(`No mistake found for review_categorization_id ${reviewCategorizationId}`);
  }

  const hasTargets = context.practiceTargets.length > 0;
  const [tier1, tier2, tier3, tier4] = await Promise.all([
    hasTargets
      ? findTier1Candidates(db, context.practiceTargets, reviewCategorizationId)
      : Promise.resolve([]),
    hasTargets
      ? findTier2Candidates(db, context.practiceTargets, reviewCategorizationId)
      : Promise.resolve([]),
    findTier3Candidates(db, context.cardId, reviewCategorizationId),
    findTier4Candidates(db, context.category, reviewCategorizationId, TIER4_SAMPLE_SIZE),
  ]);

  return composeExamples([
    { tier: 1, candidates: tier1 },
    { tier: 2, candidates: tier2 },
    { tier: 3, candidates: tier3 },
    { tier: 4, candidates: tier4 },
  ]);
}
