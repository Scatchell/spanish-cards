import type { Card } from '../api.js';

// Ephemeral client-side learning session. Nothing here touches the server:
// learning must never change FSRS state, review history, or due dates. The
// whole session lives in component state and is lost on refresh by design.

export type Rng = () => number;

export interface LearningSession {
  // The original selected set; restarting a pass always draws from this.
  selected: Card[];
  // Cards still to resolve in the current pass, in presentation order.
  queue: Card[];
  // Ids in the order cards were remembered during the current pass. The tail
  // of this list is what the user saw most recently, used to avoid replaying
  // those cards first when a new pass starts.
  rememberedIds: number[];
}

// Fraction of the previous pass treated as "recently seen" when restarting.
const RECENT_TAIL_FRACTION = 0.2;

export function startSession(cards: Card[], rng: Rng = Math.random): LearningSession {
  return { selected: cards, queue: shuffle(cards, rng), rememberedIds: [] };
}

export function currentCard(session: LearningSession): Card | undefined {
  return session.queue[0];
}

// The card was remembered once this pass: it leaves the active queue but
// stays in the selected set for future passes.
export function markRemembered(session: LearningSession): LearningSession {
  const [current, ...rest] = session.queue;
  if (!current) {
    return session;
  }
  return { ...session, queue: rest, rememberedIds: [...session.rememberedIds, current.id] };
}

// Keep the card in the current pass, reinserted at a random spot in the back
// half of the remaining queue: never immediately next, and not pinned to the
// exact end so repetition doesn't feel mechanical. This is deliberate UX
// smoothing, not a scheduling algorithm.
export function markStillLearning(
  session: LearningSession,
  rng: Rng = Math.random,
): LearningSession {
  const [current, ...rest] = session.queue;
  if (!current || rest.length === 0) {
    // Nothing else left: the only remaining card simply repeats.
    return session;
  }
  const minIndex = Math.max(1, Math.ceil(rest.length / 2));
  const index = minIndex + Math.floor(rng() * (rest.length - minIndex + 1));
  const queue = [...rest.slice(0, index), current, ...rest.slice(index)];
  return { ...session, queue };
}

// Start a fresh pass over the same selected set. The cards seen last in the
// previous pass (its final 20%, at least one card) are pushed to the back of
// the new shuffle so the end of one pass never leads the next.
export function restartPass(session: LearningSession, rng: Rng = Math.random): LearningSession {
  const tailCount = Math.max(1, Math.ceil(session.rememberedIds.length * RECENT_TAIL_FRACTION));
  const recentIds = new Set(session.rememberedIds.slice(-tailCount));
  const shuffled = shuffle(session.selected, rng);
  const queue = [
    ...shuffled.filter((card) => !recentIds.has(card.id)),
    ...shuffled.filter((card) => recentIds.has(card.id)),
  ];
  return { selected: session.selected, queue, rememberedIds: [] };
}

// Fisher-Yates shuffle of a copy; the input array is left untouched.
export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
