import type { DbPool, DbQueryable } from '../db.js';
import { withTransaction } from '../db.js';

export const CATEGORIES = [
  'vocabulary',
  'verb_form',
  'agreement',
  'grammar_words',
  'word_order',
  'missing_extra_meaning',
  'spelling_accents',
  'idiom',
  'recall_failure',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface UncategorizedReviewHistoryRow {
  id: number;
  direction: string;
  verdict: string;
  correctText: string;
  submittedText: string;
}

export interface NewCategorization {
  reviewHistoryId: number;
  category: Category;
  rationale: string;
  model: string;
}

interface UncategorizedRow {
  id: number;
  direction: string;
  verdict: string;
  correct_text: string;
  submitted_text: string;
}

function toUncategorizedRow(row: UncategorizedRow): UncategorizedReviewHistoryRow {
  return {
    id: row.id,
    direction: row.direction,
    verdict: row.verdict,
    correctText: row.correct_text,
    submittedText: row.submitted_text,
  };
}

// "Unprocessed" is always "no matching review_categorizations row" — there is
// no separate watermark/cursor. This is what makes the first-ever run
// naturally backfill all history, and what makes a crashed batch safe to
// simply retry on the next scheduler tick. Unbounded (no LIMIT): this is a
// single-user app, realistic row counts are in the hundreds/low thousands.
export async function findUncategorizedReviewHistory(
  db: DbQueryable,
): Promise<UncategorizedReviewHistoryRow[]> {
  const result = await db.query<UncategorizedRow>(
    `SELECT rh.id, rh.direction, rh.verdict, rh.correct_text, rh.submitted_text
     FROM review_history rh
     LEFT JOIN review_categorizations rc ON rc.review_history_id = rh.id
     WHERE rh.verdict IN ('incorrect', 'correctWithDifferences')
       AND rc.id IS NULL
     ORDER BY rh.id`,
  );
  return result.rows.map(toUncategorizedRow);
}

// One transaction per batch: all rows from a batch's LLM response are
// inserted, or none are (see server/src/categorization/service.ts for the
// batch-failure handling that decides when this is called). ON CONFLICT DO
// NOTHING is defensive: UNIQUE(review_history_id) means a hypothetical
// overlapping tick can never crash the batch, it just no-ops the duplicate.
export async function insertCategorizationBatch(
  pool: DbPool,
  inputs: NewCategorization[],
): Promise<void> {
  if (inputs.length === 0) {
    return;
  }
  await withTransaction(pool, async (tx) => {
    for (const input of inputs) {
      await tx.query(
        `INSERT INTO review_categorizations (review_history_id, category, rationale, model)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (review_history_id) DO NOTHING`,
        [input.reviewHistoryId, input.category, input.rationale, input.model],
      );
    }
  });
}
