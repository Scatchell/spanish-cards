import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/api.js';
import {
  currentCard,
  markRemembered,
  markStillLearning,
  restartPass,
  shuffle,
  startSession,
  updateCardInSession,
} from '../../src/learning/session.js';

function makeCard(id: number): Card {
  return {
    id,
    spanishText: `es-${id}`,
    englishText: `en-${id}`,
    languagePair: 'en<->es',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    due: '2026-01-01T00:00:00.000Z',
    reviewed: false,
  };
}

function makeCards(count: number): Card[] {
  return Array.from({ length: count }, (_, i) => makeCard(i + 1));
}

function queueIds(session: { queue: Card[] }): number[] {
  return session.queue.map((card) => card.id);
}

describe('startSession', () => {
  it('queues every selected card exactly once', () => {
    const cards = makeCards(5);
    const session = startSession(cards);
    expect([...queueIds(session)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(session.rememberedIds).toEqual([]);
    expect(session.selected).toEqual(cards);
  });
});

describe('updateCardInSession', () => {
  it('patches the matching card in both the queue and the selected set', () => {
    const session = startSession(makeCards(3));
    const updated = updateCardInSession(session, 2, { spanishText: 'nuevo' });
    expect(updated.queue.find((c) => c.id === 2)?.spanishText).toBe('nuevo');
    expect(updated.selected.find((c) => c.id === 2)?.spanishText).toBe('nuevo');
    // Other cards untouched, and rememberedIds preserved.
    expect(updated.queue.find((c) => c.id === 1)?.spanishText).toBe('es-1');
    expect(updated.rememberedIds).toEqual(session.rememberedIds);
  });

  it('is a no-op when no card matches', () => {
    const session = startSession(makeCards(2));
    const updated = updateCardInSession(session, 99, { englishText: 'x' });
    expect(updated.queue.map((c) => c.englishText).sort()).toEqual(['en-1', 'en-2']);
  });
});

describe('markRemembered', () => {
  it('removes the current card from the pass and records it', () => {
    let session = startSession(makeCards(3));
    const first = currentCard(session)!;
    session = markRemembered(session);
    expect(queueIds(session)).not.toContain(first.id);
    expect(session.rememberedIds).toEqual([first.id]);
  });

  it('keeps remembered cards out until the pass empties', () => {
    let session = startSession(makeCards(4));
    const seen: number[] = [];
    while (currentCard(session)) {
      seen.push(currentCard(session)!.id);
      session = markRemembered(session);
    }
    // Each card appeared exactly once; the pass is complete.
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(session.queue).toEqual([]);
    expect(session.rememberedIds).toEqual(seen);
  });
});

describe('markStillLearning', () => {
  it('keeps the card in the pass but never as the immediate next card', () => {
    // Random placement: verify the invariant across many trials.
    for (let trial = 0; trial < 50; trial += 1) {
      const session = startSession(makeCards(6));
      const current = currentCard(session)!;
      const next = markStillLearning(session);
      const ids = queueIds(next);
      expect(ids.filter((id) => id === current.id)).toHaveLength(1);
      expect(ids[0]).not.toBe(current.id);
    }
  });

  it('reinserts into the back half of the remaining queue', () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const session = startSession(makeCards(10));
      const current = currentCard(session)!;
      const next = markStillLearning(session);
      // 9 cards remained; the back half starts at index ceil(9 / 2) = 5.
      expect(queueIds(next).indexOf(current.id)).toBeGreaterThanOrEqual(5);
    }
  });

  it('does not always land at the exact end', () => {
    const positions = new Set<number>();
    for (let trial = 0; trial < 100; trial += 1) {
      const session = startSession(makeCards(10));
      const current = currentCard(session)!;
      positions.add(queueIds(markStillLearning(session)).indexOf(current.id));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('repeats the only remaining card when nothing else is left', () => {
    let session = startSession(makeCards(1));
    session = markStillLearning(session);
    expect(queueIds(session)).toEqual([1]);
  });

  it('with two cards left, the other card always comes first', () => {
    const session = startSession(makeCards(2));
    const [first, second] = session.queue as [Card, Card];
    expect(queueIds(markStillLearning(session))).toEqual([second.id, first.id]);
  });
});

describe('restartPass', () => {
  function completePass(session: ReturnType<typeof startSession>) {
    let s = session;
    while (currentCard(s)) {
      s = markRemembered(s);
    }
    return s;
  }

  it('reshuffles the same selected set and resets pass progress', () => {
    const done = completePass(startSession(makeCards(5)));
    const next = restartPass(done);
    expect([...queueIds(next)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(next.rememberedIds).toEqual([]);
    expect(next.selected).toEqual(done.selected);
  });

  it('pushes the last 20% of the previous pass to the back of the new one', () => {
    for (let trial = 0; trial < 25; trial += 1) {
      const done = completePass(startSession(makeCards(10)));
      const recentTail = done.rememberedIds.slice(-2); // 20% of 10
      const ids = queueIds(restartPass(done));
      expect([...ids.slice(-2)].sort((a, b) => a - b)).toEqual(
        [...recentTail].sort((a, b) => a - b),
      );
    }
  });

  it('keeps at least one recently seen card off the front for tiny batches', () => {
    for (let trial = 0; trial < 25; trial += 1) {
      const done = completePass(startSession(makeCards(2)));
      const lastSeen = done.rememberedIds[1]!;
      const ids = queueIds(restartPass(done));
      expect(ids[0]).not.toBe(lastSeen);
      expect(ids[1]).toBe(lastSeen);
    }
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const items = [1, 2, 3, 4, 5];
    const result = shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });
});
