import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/api.js';
import {
  allCardIds,
  defaultSelection,
  dueNowCardIds,
  learnCardStatus,
  toggleCardId,
  withCardsIncluded,
} from '../../src/learning/selection.js';

const NOW = new Date('2026-06-01T12:00:00.000Z');

function makeCard(id: number, overrides: Partial<Card> = {}): Card {
  return {
    id,
    spanishText: `es-${id}`,
    englishText: `en-${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    due: '2026-01-01T00:00:00.000Z',
    reviewed: false,
    ...overrides,
  };
}

const newCard = makeCard(1);
const dueCard = makeCard(2, { reviewed: true, due: '2026-06-01T11:00:00.000Z' });
const futureCard = makeCard(3, { reviewed: true, due: '2026-06-02T12:00:00.000Z' });
const deck = [newCard, dueCard, futureCard];

describe('learnCardStatus', () => {
  it('classifies unreviewed cards as new regardless of due date', () => {
    expect(learnCardStatus(newCard, NOW)).toBe('new');
    expect(learnCardStatus(makeCard(9, { due: '2027-01-01T00:00:00.000Z' }), NOW)).toBe('new');
  });

  it('splits reviewed cards into due and future', () => {
    expect(learnCardStatus(dueCard, NOW)).toBe('due');
    expect(learnCardStatus(futureCard, NOW)).toBe('future');
  });

  it('treats a card due exactly now as due', () => {
    const card = makeCard(9, { reviewed: true, due: NOW.toISOString() });
    expect(learnCardStatus(card, NOW)).toBe('due');
  });
});

describe('defaultSelection', () => {
  it('selects only new cards', () => {
    expect(defaultSelection(deck, NOW)).toEqual(new Set([1]));
  });

  it('is empty when there are no new cards', () => {
    expect(defaultSelection([dueCard, futureCard], NOW)).toEqual(new Set());
  });
});

describe('dueNowCardIds', () => {
  it('includes new and reviewed-due cards but not future-scheduled ones', () => {
    expect(dueNowCardIds(deck, NOW)).toEqual([1, 2]);
  });
});

describe('withCardsIncluded', () => {
  it('adds the given cards to the current selection without removing anything', () => {
    expect(withCardsIncluded(new Set([3]), [1, 2])).toEqual(new Set([1, 2, 3]));
  });
});

describe('allCardIds', () => {
  it('selects the full deck', () => {
    expect(allCardIds(deck)).toEqual(new Set([1, 2, 3]));
  });
});

describe('toggleCardId', () => {
  it('adds missing ids and removes present ones', () => {
    expect(toggleCardId(new Set([1]), 2)).toEqual(new Set([1, 2]));
    expect(toggleCardId(new Set([1, 2]), 2)).toEqual(new Set([1]));
  });
});
