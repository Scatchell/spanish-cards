import { Rating, createEmptyCard, fsrs } from 'ts-fsrs';
import type { Card as FsrsCard } from 'ts-fsrs';

// FSRS scheduling state for one card, decoupled from the ts-fsrs types so the
// rest of the app (repository, routes) never depends on the library directly.
export interface CardSchedule {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
}

export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export function isReviewRating(value: unknown): value is ReviewRating {
  return typeof value === 'string' && (REVIEW_RATINGS as readonly string[]).includes(value);
}

const RATING_TO_GRADE = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const;

const scheduler = fsrs(); // default FSRS parameters

// Applies a rating to a card's schedule. `current` is null for a card that has
// never been reviewed: it starts from a fresh FSRS state due "now".
export function rateSchedule(
  current: CardSchedule | null,
  rating: ReviewRating,
  now: Date,
): CardSchedule {
  const card = current ? toFsrsCard(current) : createEmptyCard(now);
  const { card: next } = scheduler.next(card, now, RATING_TO_GRADE[rating]);
  return fromFsrsCard(next);
}

function toFsrsCard(schedule: CardSchedule): FsrsCard {
  return {
    due: schedule.due,
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: schedule.elapsedDays,
    scheduled_days: schedule.scheduledDays,
    learning_steps: schedule.learningSteps,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: schedule.state,
    last_review: schedule.lastReview ?? undefined,
  };
}

function fromFsrsCard(card: FsrsCard): CardSchedule {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  };
}
