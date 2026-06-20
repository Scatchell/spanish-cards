import { describe, expect, it } from 'vitest';
import { parseReviewRequest } from '../../src/training/validation.js';

const validBody = {
  cardId: 7,
  rating: 'good',
  direction: 'spanish-to-english',
  verdict: 'correct',
  submittedText: 'hola',
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
});
