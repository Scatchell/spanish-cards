import type { Card } from '../api.js';

// Card grouping for the learning selection screen. "New" cards (never
// reviewed) are the default learning batch because previewing them before
// they enter scheduled training is the primary use case.

export type LearnCardStatus = 'new' | 'due' | 'future';

export function learnCardStatus(card: Card, now: Date): LearnCardStatus {
  if (!card.reviewed) {
    return 'new';
  }
  return new Date(card.due).getTime() <= now.getTime() ? 'due' : 'future';
}

export function cardIdsWithStatus(cards: Card[], status: LearnCardStatus, now: Date): number[] {
  return cards.filter((card) => learnCardStatus(card, now) === status).map((card) => card.id);
}

export function defaultSelection(cards: Card[], now: Date): Set<number> {
  return new Set(cardIdsWithStatus(cards, 'new', now));
}

// Everything due now: reviewed cards whose due time has passed, plus new
// cards, which are always due (their effective due date is creation time).
export function dueNowCardIds(cards: Card[], now: Date): number[] {
  return cards.filter((card) => learnCardStatus(card, now) !== 'future').map((card) => card.id);
}

// Bulk "Include …" actions expand the current selection; they never deselect.
export function withCardsIncluded(selected: ReadonlySet<number>, ids: number[]): Set<number> {
  return new Set([...selected, ...ids]);
}

export function allCardIds(cards: Card[]): Set<number> {
  return new Set(cards.map((card) => card.id));
}

export function toggleCardId(selected: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
