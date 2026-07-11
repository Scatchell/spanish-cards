import type { TrainingCard } from '../api.js';

export type Rng = () => number;
export type QueuedKind = 'scheduled' | 'retry';

export interface QueuedCard {
  card: TrainingCard;
  kind: QueuedKind;
}

export interface TrainingSession {
  queue: QueuedCard[];
  served: number;
  reviewed: number;
  correct: number;
}

const RETRY_MIN_GAP = 4;
const RETRY_MAX_GAP = 6;

export function startSession(cards: TrainingCard[]): TrainingSession {
  return {
    queue: cards.map((card) => ({ card, kind: 'scheduled' as const })),
    served: 0,
    reviewed: 0,
    correct: 0,
  };
}

export function currentCard(s: TrainingSession): QueuedCard | undefined {
  return s.queue[0];
}

export function position(s: TrainingSession): number {
  return s.served + 1;
}

export function totalCount(s: TrainingSession): number {
  return s.served + s.queue.length;
}

// Advance a graded (scheduled) card. When requeueAsRetry is true (user rated
// "again"), splices a retry copy at a random 4-6 gap into the remaining queue.
export function recordGraded(
  s: TrainingSession,
  opts: { detectedCorrect: boolean; requeueAsRetry: boolean },
  rng: Rng = Math.random,
): TrainingSession {
  const [head, ...rest] = s.queue;
  if (!head) return s;
  const queue = opts.requeueAsRetry ? spliceRetry(rest, head.card, rng) : rest;
  return {
    queue,
    served: s.served + 1,
    reviewed: s.reviewed + 1,
    correct: s.correct + (opts.detectedCorrect ? 1 : 0),
  };
}

// Resolve a retry rep. Not remembered -> re-queue again (loop). No stat changes.
export function resolveRetry(
  s: TrainingSession,
  opts: { remembered: boolean },
  rng: Rng = Math.random,
): TrainingSession {
  const [head, ...rest] = s.queue;
  if (!head) return s;
  const queue = opts.remembered ? rest : spliceRetry(rest, head.card, rng);
  return { ...s, queue, served: s.served + 1 };
}

// Patch a card's text wherever it appears (after a server-confirmed edit).
export function patchCard(
  s: TrainingSession,
  cardId: number,
  patch: Partial<Pick<TrainingCard, 'spanishText' | 'englishText'>>,
): TrainingSession {
  return {
    ...s,
    queue: s.queue.map((qc) =>
      qc.card.id === cardId ? { ...qc, card: { ...qc.card, ...patch } } : qc,
    ),
  };
}

function spliceRetry(rest: QueuedCard[], card: TrainingCard, rng: Rng): QueuedCard[] {
  const gap = RETRY_MIN_GAP + Math.floor(rng() * (RETRY_MAX_GAP - RETRY_MIN_GAP + 1));
  const index = Math.min(gap, rest.length);
  const retry: QueuedCard = { card, kind: 'retry' };
  return [...rest.slice(0, index), retry, ...rest.slice(index)];
}
