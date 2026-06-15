import type { Card } from '../api.js';

function cardBucket(card: Card, now: Date): 0 | 1 | 2 {
  if (!card.reviewed) return 0;
  return new Date(card.due) <= now ? 1 : 2;
}

export function sortCards(cards: Card[], now = new Date()): Card[] {
  return [...cards].sort((a, b) => {
    const bucketDiff = cardBucket(a, now) - cardBucket(b, now);
    if (bucketDiff !== 0) return bucketDiff;
    return new Date(a.due).getTime() - new Date(b.due).getTime();
  });
}
