import { describe, expect, it } from 'vitest';
import {
  MAX_PENDING_REVIEWS,
  createPendingReview,
  isOutboxFull,
  loadOutbox,
  newClientReviewId,
  outboxKey,
  removeById,
  saveOutbox,
  settledIds,
} from '../../src/training/outbox.js';
import type { KeyValueStorage, PendingReview } from '../../src/training/outbox.js';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const SUBMISSION = {
  cardId: 4,
  rating: 'good' as const,
  direction: 'spanish-to-english' as const,
  verdict: 'correct' as const,
  submittedText: 'cat',
  matchedText: 'cat',
};

function pending(id: string): PendingReview {
  return createPendingReview(SUBMISSION, new Date('2026-01-01T00:00:00.000Z'), id);
}

describe('outboxKey', () => {
  it('is distinct per user', () => {
    expect(outboxKey('a@x.com')).not.toBe(outboxKey('b@x.com'));
  });
});

describe('newClientReviewId', () => {
  it('produces unique v4-shaped UUIDs without crypto.randomUUID', () => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const ids = new Set(Array.from({ length: 50 }, newClientReviewId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(pattern);
  });
});

describe('createPendingReview', () => {
  it('stamps the id and ISO review time and keeps the submission fields', () => {
    const review = pending('11111111-1111-4111-8111-111111111111');
    expect(review).toMatchObject({
      ...SUBMISSION,
      clientReviewId: '11111111-1111-4111-8111-111111111111',
      reviewedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('caps submittedText at the 255-character column width', () => {
    const review = createPendingReview({ ...SUBMISSION, submittedText: 'x'.repeat(400) }, new Date());
    expect(review.submittedText).toHaveLength(255);
  });
});

describe('persistence', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const key = outboxKey('a@x.com');
    const reviews = [pending('11111111-1111-4111-8111-111111111111')];
    saveOutbox(storage, key, reviews);
    expect(loadOutbox(storage, key)).toEqual(reviews);
  });

  it('starts empty for missing, corrupt, or non-array data', () => {
    const key = outboxKey('a@x.com');
    expect(loadOutbox(memoryStorage(), key)).toEqual([]);
    expect(loadOutbox(memoryStorage({ [key]: '{not json' }), key)).toEqual([]);
    expect(loadOutbox(memoryStorage({ [key]: '{"a":1}' }), key)).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const key = outboxKey('a@x.com');
    const good = pending('11111111-1111-4111-8111-111111111111');
    const storage = memoryStorage({ [key]: JSON.stringify([good, { cardId: 'nope' }, null, 5]) });
    expect(loadOutbox(storage, key)).toEqual([good]);
  });

  it('does not throw when storage is unavailable or full', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadOutbox(throwing, 'k')).toEqual([]);
    expect(() => saveOutbox(throwing, 'k', [])).not.toThrow();
  });
});

describe('cap and settling', () => {
  it('is full at MAX_PENDING_REVIEWS', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => pending(`id-${i}`));
    expect(isOutboxFull(make(MAX_PENDING_REVIEWS - 1))).toBe(false);
    expect(isOutboxFull(make(MAX_PENDING_REVIEWS))).toBe(true);
  });

  it('removes every settled status, ignores null ids, and keeps unsettled reviews', () => {
    const reviews = [pending('a'), pending('b'), pending('c'), pending('d')];
    const ids = settledIds([
      { clientReviewId: 'a', status: 'applied' },
      { clientReviewId: 'b', status: 'duplicate' },
      { clientReviewId: 'c', status: 'cardNotFound' },
      { clientReviewId: null, status: 'invalid' },
    ]);
    expect(removeById(reviews, ids).map((r) => r.clientReviewId)).toEqual(['d']);
  });
});
