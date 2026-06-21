import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/cards/repository.js';
import { normalizeForSearch, searchCards } from '../../src/cards/search.js';

let nextId = 1;

function card(spanishText: string, englishText: string): Card {
  const id = nextId++;
  return {
    id,
    spanishText,
    englishText,
    languagePair: 'en<->es',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    due: '2026-01-01T00:00:00.000Z',
    reviewed: false,
  };
}

const deck: Card[] = [
  card('Hola', 'Hello'),
  card('Hola, ¿cómo estás?', 'Hello, how are you?'),
  card('Mi palabra favorita es hola', 'My favorite word is hello!'),
  card('Helo', 'Helo'),
  card('Tortuga', 'Turtle'),
  card('Adiós', 'Goodbye'),
];

describe('normalizeForSearch', () => {
  it('lowercases and trims', () => {
    expect(normalizeForSearch('  HeLLo  ')).toBe('hello');
  });

  it('collapses repeated spaces', () => {
    expect(normalizeForSearch('hello   there  friend')).toBe('hello there friend');
  });

  it('strips diacritics', () => {
    expect(normalizeForSearch('adiós')).toBe('adios');
    expect(normalizeForSearch('¿Cómo estás?')).toBe('como estas');
  });

  it('strips punctuation while preserving tokens', () => {
    expect(normalizeForSearch('My favorite word is hello!')).toBe('my favorite word is hello');
    expect(normalizeForSearch('Hello, how are you?')).toBe('hello how are you');
  });
});

describe('searchCards ranking', () => {
  it('ranks exact first, then containment, then typo, and excludes unrelated', () => {
    const matches = searchCards(deck, 'Hello', 'english');
    const texts = matches.map((m) => m.matchedText);
    expect(texts[0]).toBe('Hello');
    expect(matches[0]?.rankReason).toBe('exact');
    expect(texts).toContain('Hello, how are you?');
    expect(texts).toContain('My favorite word is hello!');
    expect(texts).toContain('Helo');
    expect(texts).not.toContain('Turtle');
    expect(texts.indexOf('Helo')).toBeGreaterThan(texts.indexOf('Hello, how are you?'));
    expect(texts.indexOf('Helo')).toBeGreaterThan(texts.indexOf('My favorite word is hello!'));
  });

  it('orders scores from best to weakest', () => {
    const matches = searchCards(deck, 'Hello', 'english');
    const scores = matches.map((m) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('prefers shorter containment matches over longer incidental ones', () => {
    const matches = searchCards(deck, 'Hello', 'english');
    const containment = matches.filter((m) => m.rankReason === 'containment').map((m) => m.matchedText);
    expect(containment).toEqual(['Hello, how are you?', 'My favorite word is hello!']);
  });

  it('returns an empty array when nothing is close enough', () => {
    expect(searchCards(deck, 'photosynthesis', 'english')).toEqual([]);
  });

  it('returns an empty array for a punctuation-only query', () => {
    expect(searchCards(deck, '?!', 'english')).toEqual([]);
  });

  it('matches Spanish accents leniently', () => {
    const matches = searchCards(deck, 'adios', 'spanish');
    expect(matches[0]?.matchedText).toBe('Adiós');
    expect(matches[0]?.rankReason).toBe('exact');
  });

  it('matches accented queries against unaccented text', () => {
    const matches = searchCards(deck, 'holá', 'spanish');
    expect(matches[0]?.matchedText).toBe('Hola');
  });
});

describe('searchCards language filtering', () => {
  it('searches only english_text when language is english', () => {
    const matches = searchCards(deck, 'hola', 'english');
    expect(matches.every((m) => m.matchedField === 'englishText')).toBe(true);
    expect(matches).toEqual([]);
  });

  it('searches only spanish_text when language is spanish', () => {
    const matches = searchCards(deck, 'hello', 'spanish');
    expect(matches.every((m) => m.matchedField === 'spanishText')).toBe(true);
    expect(matches.map((m) => m.matchedText)).not.toContain('Hello');
  });

  it('searches both fields when language is both', () => {
    const fields = new Set(searchCards(deck, 'hola', 'both').map((m) => m.matchedField));
    expect(fields.has('spanishText')).toBe(true);
  });

  it('returns at most one match per card when both fields match', () => {
    const cards = [card('hola', 'hola')];
    const matches = searchCards(cards, 'hola', 'both');
    expect(matches).toHaveLength(1);
  });
});

describe('searchCards limits', () => {
  const bigDeck = Array.from({ length: 30 }, (_, i) => card(`hola ${i}`, `hello ${i}`));

  it('defaults to 10 results', () => {
    expect(searchCards(bigDeck, 'hello', 'english')).toHaveLength(10);
  });

  it('honors an explicit limit', () => {
    expect(searchCards(bigDeck, 'hello', 'english', 3)).toHaveLength(3);
  });

  it('caps the limit at 50', () => {
    const hugeDeck = Array.from({ length: 60 }, (_, i) => card(`hola ${i}`, `hello ${i}`));
    expect(searchCards(hugeDeck, 'hello', 'english', 999)).toHaveLength(50);
  });
});
