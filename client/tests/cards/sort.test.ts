import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/api.js';
import { sortCards } from '../../src/cards/sort.js';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function makeCard(overrides: Partial<Card> & { id: number }): Card {
  return {
    spanishText: 'hola',
    englishText: 'hello',
    languagePair: 'en<->es',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    due: '2026-01-01T00:00:00.000Z',
    reviewed: false,
    ...overrides,
  };
}

const newCard = makeCard({ id: 1, reviewed: false, due: '2026-06-10T00:00:00.000Z' });
const dueNow = makeCard({ id: 2, reviewed: true, due: '2026-06-14T00:00:00.000Z' });
const dueLater = makeCard({ id: 3, reviewed: true, due: '2026-06-20T00:00:00.000Z' });

describe('sortCards', () => {
  it('new cards come before due-now cards', () => {
    const result = sortCards([dueNow, newCard], NOW);
    expect(result.map((c) => c.id)).toEqual([1, 2]);
  });

  it('due-now cards come before future cards', () => {
    const result = sortCards([dueLater, dueNow], NOW);
    expect(result.map((c) => c.id)).toEqual([2, 3]);
  });

  it('new cards come before future cards', () => {
    const result = sortCards([dueLater, newCard], NOW);
    expect(result.map((c) => c.id)).toEqual([1, 3]);
  });

  it('full order: new, due-now, future', () => {
    const result = sortCards([dueLater, dueNow, newCard], NOW);
    expect(result.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('within due-now, most overdue appears first', () => {
    const mostOverdue = makeCard({ id: 10, reviewed: true, due: '2026-01-01T00:00:00.000Z' });
    const lessOverdue = makeCard({ id: 11, reviewed: true, due: '2026-06-14T00:00:00.000Z' });
    const result = sortCards([lessOverdue, mostOverdue], NOW);
    expect(result.map((c) => c.id)).toEqual([10, 11]);
  });

  it('within future, soonest due appears first', () => {
    const soonest = makeCard({ id: 20, reviewed: true, due: '2026-06-16T00:00:00.000Z' });
    const latest = makeCard({ id: 21, reviewed: true, due: '2026-12-01T00:00:00.000Z' });
    const result = sortCards([latest, soonest], NOW);
    expect(result.map((c) => c.id)).toEqual([20, 21]);
  });

  it('within new cards, earliest created appears first', () => {
    const older = makeCard({ id: 30, reviewed: false, due: '2026-01-01T00:00:00.000Z' });
    const newer = makeCard({ id: 31, reviewed: false, due: '2026-06-01T00:00:00.000Z' });
    const result = sortCards([newer, older], NOW);
    expect(result.map((c) => c.id)).toEqual([30, 31]);
  });

  it('does not mutate the input array', () => {
    const cards = [dueLater, newCard, dueNow];
    sortCards(cards, NOW);
    expect(cards.map((c) => c.id)).toEqual([3, 1, 2]);
  });

  it('card due exactly at now is treated as due now', () => {
    const exactlyNow = makeCard({ id: 40, reviewed: true, due: NOW.toISOString() });
    const result = sortCards([dueLater, exactlyNow], NOW);
    expect(result.map((c) => c.id)).toEqual([40, 3]);
  });
});
