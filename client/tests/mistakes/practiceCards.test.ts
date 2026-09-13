import { describe, expect, it } from 'vitest';
import type { PracticeSentenceDto } from '../../src/api.js';
import { sentencesToCards } from '../../src/mistakes/practiceCards.js';

function makeSentences(count: number): PracticeSentenceDto[] {
  return Array.from({ length: count }, (_, i) => ({
    spanish: `es-${i + 1}`,
    english: `en-${i + 1}`,
  }));
}

describe('sentencesToCards', () => {
  it('builds one card per sentence, carrying the spanish/english text over', () => {
    const cards = sentencesToCards(makeSentences(3));
    expect(cards).toHaveLength(3);
    expect(cards[0]!.spanishText).toBe('es-1');
    expect(cards[0]!.englishText).toBe('en-1');
    expect(cards[2]!.spanishText).toBe('es-3');
  });

  it('gives every card a unique id', () => {
    const cards = sentencesToCards(makeSentences(5));
    const ids = new Set(cards.map((card) => card.id));
    expect(ids.size).toBe(5);
  });
});
