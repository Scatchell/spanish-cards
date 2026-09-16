import { describe, expect, it } from 'vitest';
import type { TrainingCard } from '../../src/api.js';
import { answerAlternates } from '../../src/training/direction.js';

function card(overrides: Partial<TrainingCard> = {}): TrainingCard {
  return {
    id: 1,
    spanishText: 'coche',
    englishText: 'car',
    languagePair: 'en<->es',
    due: '2026-01-01T00:00:00.000Z',
    spanishAlternates: [{ id: 1, text: 'auto' }],
    englishAlternates: [{ id: 2, text: 'automobile' }],
    ...overrides,
  };
}

describe('answerAlternates', () => {
  it('returns englishAlternates when answering into English', () => {
    expect(answerAlternates(card(), 'spanish-to-english')).toEqual([{ id: 2, text: 'automobile' }]);
  });

  it('returns spanishAlternates when answering into Spanish', () => {
    expect(answerAlternates(card(), 'english-to-spanish')).toEqual([{ id: 1, text: 'auto' }]);
  });
});
