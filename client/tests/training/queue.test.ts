import { describe, expect, it } from 'vitest';
import type { TrainingCard } from '../../src/api.js';
import {
  currentCard,
  patchCard,
  position,
  recordGraded,
  resolveRetry,
  startSession,
  totalCount,
} from '../../src/training/queue.js';

function makeCard(id: number): TrainingCard {
  return {
    id,
    spanishText: `es-${id}`,
    englishText: `en-${id}`,
    languagePair: 'en<->es',
    due: '2026-01-01T00:00:00.000Z',
  };
}

function makeCards(count: number): TrainingCard[] {
  return Array.from({ length: count }, (_, i) => makeCard(i + 1));
}

function queueIds(s: { queue: { card: TrainingCard }[] }): number[] {
  return s.queue.map((qc) => qc.card.id);
}

function queueKinds(s: { queue: { kind: string }[] }): string[] {
  return s.queue.map((qc) => qc.kind);
}

// Seeded rng returning a fixed value; gap = RETRY_MIN_GAP + floor(v * (MAX-MIN+1))
// v=0 → gap=4, v=0.999 → gap=6
const rngMin = () => 0;      // always returns gap=4
const rngMid = () => 0.5;   // gap=5
const rngMax = () => 0.999; // gap=6

describe('startSession', () => {
  it('wraps every card as scheduled with zeroed stats', () => {
    const cards = makeCards(3);
    const s = startSession(cards);
    expect(queueIds(s)).toEqual([1, 2, 3]);
    expect(queueKinds(s)).toEqual(['scheduled', 'scheduled', 'scheduled']);
    expect(s.served).toBe(0);
    expect(s.reviewed).toBe(0);
    expect(s.correct).toBe(0);
  });

  it('currentCard returns the head', () => {
    const s = startSession(makeCards(3));
    expect(currentCard(s)?.card.id).toBe(1);
  });

  it('returns undefined currentCard for empty session', () => {
    expect(currentCard(startSession([]))).toBeUndefined();
  });
});

describe('position / totalCount', () => {
  it('starts at 1 of N', () => {
    const s = startSession(makeCards(5));
    expect(position(s)).toBe(1);
    expect(totalCount(s)).toBe(5);
  });

  it('grows with retries added', () => {
    const s = recordGraded(startSession(makeCards(5)), { detectedCorrect: false, requeueAsRetry: true }, rngMin);
    // served=1, queue has 4 remaining + 1 retry = 5 → total=6
    expect(position(s)).toBe(2);
    expect(totalCount(s)).toBe(6);
  });
});

describe('recordGraded without retry', () => {
  it('removes head, increments served and reviewed', () => {
    const s = recordGraded(startSession(makeCards(3)), { detectedCorrect: true, requeueAsRetry: false });
    expect(queueIds(s)).toEqual([2, 3]);
    expect(s.served).toBe(1);
    expect(s.reviewed).toBe(1);
    expect(s.correct).toBe(1);
  });

  it('increments correct only when detectedCorrect', () => {
    const s = recordGraded(startSession(makeCards(2)), { detectedCorrect: false, requeueAsRetry: false });
    expect(s.correct).toBe(0);
    expect(s.reviewed).toBe(1);
  });

  it('is a no-op on empty session', () => {
    const s = startSession([]);
    expect(recordGraded(s, { detectedCorrect: true, requeueAsRetry: false })).toBe(s);
  });
});

describe('recordGraded with requeueAsRetry', () => {
  it('inserts a single retry copy of the head card at a 4-6 gap', () => {
    // 10 cards; after removing head (card 1), 9 remain; retry goes at index 4-6
    const s10 = startSession(makeCards(10));

    for (const [rng, expectedGap] of [[rngMin, 4], [rngMid, 5], [rngMax, 6]] as const) {
      const s = recordGraded(s10, { detectedCorrect: false, requeueAsRetry: true }, rng);
      const retryIndex = s.queue.findIndex((qc) => qc.kind === 'retry');
      expect(retryIndex).toBe(expectedGap);
      expect(s.queue[retryIndex]?.card.id).toBe(1);
      // All other entries are still scheduled
      expect(s.queue.filter((qc) => qc.kind === 'retry')).toHaveLength(1);
    }
  });

  it('does not count retry stats (reviewed/correct advance normally)', () => {
    const s = recordGraded(startSession(makeCards(6)), { detectedCorrect: true, requeueAsRetry: true }, rngMin);
    expect(s.reviewed).toBe(1);
    expect(s.correct).toBe(1);
    expect(s.served).toBe(1);
  });
});

describe('retry gap clamping', () => {
  it('clamps to rest.length when fewer than 4 cards remain', () => {
    for (const count of [0, 1, 2, 3] as const) {
      // 1 card + count more = count+1 total; head removed leaves count rest
      const s = startSession([makeCard(99), ...makeCards(count)]);
      const result = recordGraded(s, { detectedCorrect: false, requeueAsRetry: true }, rngMax);
      const retryIndex = result.queue.findIndex((qc) => qc.card.id === 99);
      expect(retryIndex).toBe(count); // clamped to rest.length
    }
  });

  it('with 0 remaining becomes the only card', () => {
    const s = startSession([makeCard(1)]);
    const result = recordGraded(s, { detectedCorrect: false, requeueAsRetry: true }, rngMin);
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.card.id).toBe(1);
    expect(result.queue[0]?.kind).toBe('retry');
  });
});

describe('resolveRetry', () => {
  function sessionWithRetryAtHead() {
    // Start with 8 cards, grade first as "again" so retry ends up at index 4
    return recordGraded(startSession(makeCards(8)), { detectedCorrect: false, requeueAsRetry: true }, rngMin);
  }

  it('removes the retry card when remembered=true', () => {
    // Advance to the retry position
    let s = sessionWithRetryAtHead();
    // Advance past cards 2-5 to reach the retry
    for (let i = 0; i < 4; i++) {
      s = recordGraded(s, { detectedCorrect: true, requeueAsRetry: false });
    }
    expect(currentCard(s)?.kind).toBe('retry');
    const beforeCount = s.queue.length;
    s = resolveRetry(s, { remembered: true });
    expect(s.queue.length).toBe(beforeCount - 1);
    expect(s.queue.every((qc) => qc.kind !== 'retry' || qc.card.id !== 1)).toBe(true);
    expect(s.served).toBe(s.served); // served incremented (checked below)
  });

  it('increments served but not reviewed/correct on resolve', () => {
    let s = sessionWithRetryAtHead();
    for (let i = 0; i < 4; i++) {
      s = recordGraded(s, { detectedCorrect: true, requeueAsRetry: false });
    }
    const reviewedBefore = s.reviewed;
    const correctBefore = s.correct;
    const servedBefore = s.served;
    s = resolveRetry(s, { remembered: true });
    expect(s.reviewed).toBe(reviewedBefore);
    expect(s.correct).toBe(correctBefore);
    expect(s.served).toBe(servedBefore + 1);
  });

  it('re-queues another retry at 4-6 gap when remembered=false (loop)', () => {
    // Use 12 cards so ≥7 remain when the retry is resolved, giving room for gap=4
    let s = recordGraded(
      startSession(makeCards(12)),
      { detectedCorrect: false, requeueAsRetry: true },
      rngMin,
    );
    // Advance 4 scheduled cards to reach the retry at head
    for (let i = 0; i < 4; i++) {
      s = recordGraded(s, { detectedCorrect: true, requeueAsRetry: false });
    }
    expect(currentCard(s)?.kind).toBe('retry');
    const retryCardId = currentCard(s)!.card.id;
    s = resolveRetry(s, { remembered: false }, rngMin);
    // rest has 7 cards; gap=4 is within range so retry lands at index 4
    const newRetryIndex = s.queue.findIndex((qc) => qc.kind === 'retry' && qc.card.id === retryCardId);
    expect(newRetryIndex).toBe(4);
  });

  it('is a no-op on empty session', () => {
    const s = startSession([]);
    expect(resolveRetry(s, { remembered: true })).toBe(s);
  });
});

describe('patchCard', () => {
  it('updates spanishText for matching scheduled cards', () => {
    const s = startSession(makeCards(3));
    const patched = patchCard(s, 2, { spanishText: 'nuevo' });
    expect(patched.queue.find((qc) => qc.card.id === 2)?.card.spanishText).toBe('nuevo');
    expect(patched.queue.find((qc) => qc.card.id === 1)?.card.spanishText).toBe('es-1');
  });

  it('updates retry copies of the same card', () => {
    const s = recordGraded(startSession(makeCards(6)), { detectedCorrect: false, requeueAsRetry: true }, rngMin);
    // card 1 should now have a retry copy in the queue
    const patched = patchCard(s, 1, { englishText: 'updated' });
    const retryCopy = patched.queue.find((qc) => qc.kind === 'retry' && qc.card.id === 1);
    expect(retryCopy?.card.englishText).toBe('updated');
  });

  it('is a no-op when no card matches', () => {
    const s = startSession(makeCards(2));
    const patched = patchCard(s, 99, { spanishText: 'x' });
    expect(patched.queue.map((qc) => qc.card.spanishText)).toEqual(['es-1', 'es-2']);
  });
});
