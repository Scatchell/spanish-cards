import { describe, expect, it, vi } from 'vitest';
import type { NewCategorization, UncategorizedReviewHistoryRow } from '../../src/categorization/repository.js';
import type { CategorizationInput, CategorizationOutput } from '../../src/categorization/llm.js';
import { BATCH_SIZE, chunk, runCategorizationTick } from '../../src/categorization/service.js';

function fakeRow(id: number): UncategorizedReviewHistoryRow {
  return {
    id,
    direction: 'english-to-spanish',
    verdict: 'incorrect',
    correctText: 'la casa blanca',
    submittedText: 'la casa blanco',
  };
}

function echoResults(items: CategorizationInput[]): CategorizationOutput[] {
  return items.map((item) => ({
    index: item.index,
    category: 'agreement',
    rationale: 'gender agreement error',
  }));
}

describe('chunk', () => {
  it('splits evenly divisible arrays', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('puts the remainder in the last chunk', () => {
    const items = Array.from({ length: 61 }, (_, i) => i);
    const batches = chunk(items, 30);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(30);
    expect(batches[1]).toHaveLength(30);
    expect(batches[2]).toHaveLength(1);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 30)).toEqual([]);
  });
});

describe('runCategorizationTick', () => {
  it('no-ops without calling generate or insert when nothing is pending', async () => {
    const generate = vi.fn();
    const insertCategorizationBatch = vi.fn();
    const result = await runCategorizationTick({
      findUncategorized: async () => [],
      insertCategorizationBatch,
      generate,
    });
    expect(result).toEqual({ processedCount: 0, failedBatchCount: 0 });
    expect(generate).not.toHaveBeenCalled();
    expect(insertCategorizationBatch).not.toHaveBeenCalled();
  });

  it('no-ops without calling insert when generate is null (no API key configured)', async () => {
    const insertCategorizationBatch = vi.fn();
    const result = await runCategorizationTick({
      findUncategorized: async () => [fakeRow(1)],
      insertCategorizationBatch,
      generate: null,
    });
    expect(result).toEqual({ processedCount: 0, failedBatchCount: 0 });
    expect(insertCategorizationBatch).not.toHaveBeenCalled();
  });

  it('processes a single batch and inserts mapped rows', async () => {
    const inserted: NewCategorization[][] = [];
    const result = await runCategorizationTick({
      findUncategorized: async () => [fakeRow(1), fakeRow(2)],
      insertCategorizationBatch: async (inputs) => {
        inserted.push(inputs);
      },
      generate: async (items) => echoResults(items),
    });
    expect(result).toEqual({ processedCount: 2, failedBatchCount: 0 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual([
      { reviewHistoryId: 1, category: 'agreement', rationale: 'gender agreement error', model: 'gpt-5.4-mini' },
      { reviewHistoryId: 2, category: 'agreement', rationale: 'gender agreement error', model: 'gpt-5.4-mini' },
    ]);
  });

  it('splits into multiple batches at BATCH_SIZE boundaries', async () => {
    const rows = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => fakeRow(i + 1));
    const generate = vi.fn(async (items: CategorizationInput[]) => echoResults(items));
    const inserted: NewCategorization[][] = [];
    const result = await runCategorizationTick({
      findUncategorized: async () => rows,
      insertCategorizationBatch: async (inputs) => {
        inserted.push(inputs);
      },
      generate,
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(inserted).toHaveLength(2);
    expect(result).toEqual({ processedCount: BATCH_SIZE + 5, failedBatchCount: 0 });
  });

  it('skips a failing batch and still processes the rest', async () => {
    const rows = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => fakeRow(i + 1));
    let call = 0;
    const inserted: NewCategorization[][] = [];
    const result = await runCategorizationTick({
      findUncategorized: async () => rows,
      insertCategorizationBatch: async (inputs) => {
        inserted.push(inputs);
      },
      generate: async (items) => {
        call += 1;
        if (call === 1) {
          throw new Error('API down');
        }
        return echoResults(items);
      },
    });
    expect(result).toEqual({ processedCount: 5, failedBatchCount: 1 });
    expect(inserted).toHaveLength(1);
  });

  it('treats a response length mismatch as a failed batch, not a crash', async () => {
    const result = await runCategorizationTick({
      findUncategorized: async () => [fakeRow(1), fakeRow(2)],
      insertCategorizationBatch: vi.fn(),
      generate: async () => [{ index: 0, category: 'agreement', rationale: 'only one result' }],
    });
    expect(result).toEqual({ processedCount: 0, failedBatchCount: 1 });
  });

  it('treats a missing index in the response as a failed batch, not a crash', async () => {
    const result = await runCategorizationTick({
      findUncategorized: async () => [fakeRow(1), fakeRow(2)],
      insertCategorizationBatch: vi.fn(),
      generate: async () => [
        { index: 0, category: 'agreement', rationale: 'ok' },
        { index: 0, category: 'agreement', rationale: 'duplicate index, index 1 missing' },
      ],
    });
    expect(result).toEqual({ processedCount: 0, failedBatchCount: 1 });
  });
});
