import type { NewCategorization, UncategorizedReviewHistoryRow } from './repository.js';
import { CATEGORIZATION_MODEL } from './llm.js';
import type { CategorizationGenerator, CategorizationOutput } from './llm.js';

export const BATCH_SIZE = 30;

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export interface CategorizationTickDeps {
  findUncategorized: () => Promise<UncategorizedReviewHistoryRow[]>;
  insertCategorizationBatch: (inputs: NewCategorization[]) => Promise<void>;
  generate: CategorizationGenerator | null;
}

export interface CategorizationTickResult {
  processedCount: number;
  failedBatchCount: number;
}

// Matches each result back to its row by `index` (not by re-echoing text) and
// throws on any shape mismatch, which the caller below treats as a whole
// failed batch — never a partial insert.
function mapResultsToInserts(
  batch: UncategorizedReviewHistoryRow[],
  results: CategorizationOutput[],
): NewCategorization[] {
  if (results.length !== batch.length) {
    throw new Error(
      `Categorization response length mismatch: expected ${batch.length}, got ${results.length}`,
    );
  }
  const byIndex = new Map(results.map((result) => [result.index, result]));
  return batch.map((row, i) => {
    const result = byIndex.get(i);
    if (!result) {
      throw new Error(`Categorization response missing index ${i}`);
    }
    return {
      reviewHistoryId: row.id,
      category: result.category,
      rationale: result.rationale,
      practiceTargets: result.practiceTargets,
      model: CATEGORIZATION_MODEL,
    };
  });
}

// "Unprocessed since last run" is always "not yet in review_categorizations"
// — there is no persisted watermark. A batch-level failure (API error,
// timeout, schema mismatch) is logged and skipped; those rows stay
// unprocessed and are retried automatically on the next tick.
export async function runCategorizationTick(
  deps: CategorizationTickDeps,
): Promise<CategorizationTickResult> {
  const pending = await deps.findUncategorized();
  const generate = deps.generate;
  if (pending.length === 0 || !generate) {
    return { processedCount: 0, failedBatchCount: 0 };
  }

  let processedCount = 0;
  let failedBatchCount = 0;

  for (const batch of chunk(pending, BATCH_SIZE)) {
    try {
      const results = await generate(
        batch.map((row, i) => ({
          index: i,
          direction: row.direction,
          verdict: row.verdict,
          correctText: row.correctText,
          submittedText: row.submittedText,
        })),
      );
      const inputs = mapResultsToInserts(batch, results);
      await deps.insertCategorizationBatch(inputs);
      processedCount += inputs.length;
    } catch (err) {
      failedBatchCount += 1;
      console.error('Categorization batch failed:', err);
    }
  }

  return { processedCount, failedBatchCount };
}
