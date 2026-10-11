import { describe, expect, it } from 'vitest';
import {
  MAX_BATCH_REVIEWS,
  parseReviewBatch,
  parseReviewItem,
  parseReviewRequest,
} from '../../src/training/validation.js';

const validBody = {
  cardId: 7,
  rating: 'good',
  direction: 'spanish-to-english',
  verdict: 'correct',
  submittedText: 'hola',
  matchedText: 'hello',
};

describe('parseReviewRequest', () => {
  it('accepts a well-formed body', () => {
    expect(parseReviewRequest(validBody)).toEqual(validBody);
  });

  it('accepts every rating and both directions', () => {
    for (const rating of ['again', 'hard', 'good', 'easy']) {
      for (const direction of ['spanish-to-english', 'english-to-spanish']) {
        expect(parseReviewRequest({ ...validBody, rating, direction })).toEqual({
          ...validBody,
          rating,
          direction,
        });
      }
    }
  });

  it('rejects missing or null bodies', () => {
    expect(parseReviewRequest(undefined)).toBeNull();
    expect(parseReviewRequest(null)).toBeNull();
    expect(parseReviewRequest({})).toBeNull();
  });

  it('rejects non-integer card ids', () => {
    expect(parseReviewRequest({ ...validBody, cardId: '7' })).toBeNull();
    expect(parseReviewRequest({ ...validBody, cardId: 1.5 })).toBeNull();
  });

  it('rejects unknown ratings and directions', () => {
    expect(parseReviewRequest({ ...validBody, rating: 'perfect' })).toBeNull();
    expect(parseReviewRequest({ ...validBody, direction: 'english-to-french' })).toBeNull();
  });

  it('accepts every verdict', () => {
    for (const verdict of ['correct', 'correctWithDifferences', 'incorrect']) {
      expect(parseReviewRequest({ ...validBody, verdict })).toEqual({ ...validBody, verdict });
    }
  });

  it('rejects unknown verdicts', () => {
    expect(parseReviewRequest({ ...validBody, verdict: 'maybe' })).toBeNull();
    expect(parseReviewRequest({ ...validBody, verdict: undefined })).toBeNull();
  });

  it('requires submittedText to be a string but allows an empty one', () => {
    expect(parseReviewRequest({ ...validBody, submittedText: '' })).toEqual({
      ...validBody,
      submittedText: '',
    });
    expect(parseReviewRequest({ ...validBody, submittedText: 42 })).toBeNull();
    expect(parseReviewRequest({ ...validBody, submittedText: undefined })).toBeNull();
  });

  it('rejects a body missing matchedText', () => {
    const result = parseReviewRequest({
      cardId: 1,
      rating: 'good',
      direction: 'spanish-to-english',
      verdict: 'correct',
      submittedText: 'gato',
    });
    expect(result).toBeNull();
  });

  it('accepts a body with matchedText', () => {
    const result = parseReviewRequest({
      cardId: 1,
      rating: 'good',
      direction: 'spanish-to-english',
      verdict: 'correct',
      submittedText: 'cat',
      matchedText: 'cat',
    });
    expect(result?.matchedText).toBe('cat');
  });
});

const ID_A = '3f8f6f0e-5b7a-4a52-9d4e-0f2f6a1c9b11';
const ID_B = '8d1c3b52-77a4-4a0e-8a2e-6e9b9a1f2c33';
const validItem = { ...validBody, clientReviewId: ID_A, reviewedAt: '2026-01-02T03:04:05.000Z' };

describe('parseReviewItem', () => {
  it('accepts a review with an id and timestamp', () => {
    expect(parseReviewItem(validItem)).toEqual({
      clientReviewId: ID_A,
      reviewedAt: new Date('2026-01-02T03:04:05.000Z'),
      request: validBody,
    });
  });

  it('rejects a missing, non-uuid, or non-string clientReviewId', () => {
    expect(parseReviewItem({ ...validItem, clientReviewId: undefined })).toBeNull();
    expect(parseReviewItem({ ...validItem, clientReviewId: 'not-a-uuid' })).toBeNull();
    expect(parseReviewItem({ ...validItem, clientReviewId: 5 })).toBeNull();
  });

  it('rejects a missing, non-string, or unparseable reviewedAt', () => {
    expect(parseReviewItem({ ...validItem, reviewedAt: undefined })).toBeNull();
    expect(parseReviewItem({ ...validItem, reviewedAt: 1700000000000 })).toBeNull();
    expect(parseReviewItem({ ...validItem, reviewedAt: 'yesterday-ish' })).toBeNull();
  });

  it('rejects an item whose review fields are invalid', () => {
    expect(parseReviewItem({ ...validItem, rating: 'perfect' })).toBeNull();
  });
});

describe('parseReviewBatch', () => {
  it('returns null for a non-array, empty, or oversized reviews list', () => {
    expect(parseReviewBatch(undefined)).toBeNull();
    expect(parseReviewBatch({})).toBeNull();
    expect(parseReviewBatch({ reviews: 'x' })).toBeNull();
    expect(parseReviewBatch({ reviews: [] })).toBeNull();
    expect(
      parseReviewBatch({ reviews: Array.from({ length: MAX_BATCH_REVIEWS + 1 }, () => validItem) }),
    ).toBeNull();
  });

  it('accepts exactly the maximum', () => {
    const entries = parseReviewBatch({
      reviews: Array.from({ length: MAX_BATCH_REVIEWS }, () => validItem),
    });
    expect(entries).toHaveLength(MAX_BATCH_REVIEWS);
  });

  it('keeps one entry per input in order, flagging malformed ones without dropping them', () => {
    const entries = parseReviewBatch({
      reviews: [validItem, { ...validItem, clientReviewId: ID_B, rating: 'nope' }, null, 7],
    })!;
    expect(entries.map((e) => e.item !== null)).toEqual([true, false, false, false]);
    expect(entries.map((e) => e.clientReviewId)).toEqual([ID_A, ID_B, null, null]);
  });
});
