import { describe, expect, it } from 'vitest';
import { parseReviewRequest } from './validation.js';

const validBody = {
  cardId: 7,
  rating: 'good',
  direction: 'spanish-to-english',
  detectedCorrect: true,
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

  it('rejects a non-boolean detectedCorrect', () => {
    expect(parseReviewRequest({ ...validBody, detectedCorrect: 'yes' })).toBeNull();
    expect(parseReviewRequest({ ...validBody, detectedCorrect: undefined })).toBeNull();
  });
});
