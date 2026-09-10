import type { AppConfig } from '../config.js';
import type { DbPool } from '../db.js';
import { createCategorizationGenerator } from './llm.js';
import { findUncategorizedReviewHistory, insertCategorizationBatch } from './repository.js';
import { runCategorizationTick } from './service.js';

const TICK_INTERVAL_MS = 60 * 60 * 1000;

// Hourly rather than literally daily: the API restarts on every deploy and
// there's no persisted "last run" timestamp, so a fixed 24h timer from
// process boot would drift on every restart. An hourly tick that no-ops
// (zero LLM calls) whenever nothing is pending is restart-safe and still
// satisfies "runs about daily" in practice, while giving low latency on the
// first-ever historical backfill.
export function startCategorizationScheduler(config: AppConfig, pool: DbPool): void {
  const generate = createCategorizationGenerator(config);

  const tick = async () => {
    try {
      const result = await runCategorizationTick({
        findUncategorized: () => findUncategorizedReviewHistory(pool),
        insertCategorizationBatch: (inputs) => insertCategorizationBatch(pool, inputs),
        generate,
      });
      if (result.processedCount > 0 || result.failedBatchCount > 0) {
        console.log(
          `Categorization tick: ${result.processedCount} categorized, ` +
            `${result.failedBatchCount} batch(es) failed`,
        );
      }
    } catch (err) {
      // Must never throw out of the interval callback — one bad tick can't
      // be allowed to kill the scheduler for the rest of the process's life.
      console.error('Categorization tick crashed:', err);
    }
  };

  void tick();
  setInterval(tick, TICK_INTERVAL_MS);
}
