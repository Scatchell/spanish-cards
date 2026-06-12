import type { DbQueryable } from '../db.js';
import type { CardSchedule, ReviewRating } from './scheduler.js';
import type { PromptDirection } from './validation.js';

// A card as presented in the training queue. `due` is the effective due time:
// the FSRS due date, or the card's creation time if it has never been reviewed.
export interface TrainingCard {
  id: number;
  spanishText: string;
  englishText: string;
  languagePair: string;
  due: string;
}

export type QueueScope = 'due' | 'ahead';

interface QueueRow {
  id: number;
  spanish_text: string;
  english_text: string;
  language_pair: string;
  due: Date;
}

interface ScheduleRow {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: Date | null;
}

// Cards ordered oldest-due-first. Scope 'due' returns cards due at `now`;
// 'ahead' returns the not-yet-due cards soonest-first for studying ahead.
export async function getTrainingQueue(
  db: DbQueryable,
  scope: QueueScope,
  now: Date,
): Promise<TrainingCard[]> {
  const comparison = scope === 'due' ? '<=' : '>';
  const result = await db.query<QueueRow>(
    `SELECT c.id, c.spanish_text, c.english_text, c.language_pair, COALESCE(s.due, c.created_at) AS due
     FROM cards c
     LEFT JOIN card_schedules s ON s.card_id = c.id
     WHERE COALESCE(s.due, c.created_at) ${comparison} $1
     ORDER BY COALESCE(s.due, c.created_at) ASC, c.id ASC`,
    [now],
  );
  return result.rows.map((row) => ({
    id: row.id,
    spanishText: row.spanish_text,
    englishText: row.english_text,
    languagePair: row.language_pair,
    due: row.due.toISOString(),
  }));
}

// Number of cards due at `now`, using the same effective-due rule as the
// training queue.
export async function countDueCards(db: DbQueryable, now: Date): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM cards c
     LEFT JOIN card_schedules s ON s.card_id = c.id
     WHERE COALESCE(s.due, c.created_at) <= $1`,
    [now],
  );
  return result.rows[0]?.count ?? 0;
}

// The card's effective due time (see TrainingCard), or null when the card
// does not exist.
export async function getEffectiveDue(db: DbQueryable, cardId: number): Promise<Date | null> {
  const result = await db.query<{ due: Date }>(
    `SELECT COALESCE(s.due, c.created_at) AS due
     FROM cards c
     LEFT JOIN card_schedules s ON s.card_id = c.id
     WHERE c.id = $1`,
    [cardId],
  );
  return result.rows[0]?.due ?? null;
}

export async function getSchedule(db: DbQueryable, cardId: number): Promise<CardSchedule | null> {
  const result = await db.query<ScheduleRow>(
    `SELECT due, stability, difficulty, elapsed_days, scheduled_days,
            learning_steps, reps, lapses, state, last_review
     FROM card_schedules WHERE card_id = $1`,
    [cardId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    learningSteps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.last_review,
  };
}

export async function upsertSchedule(
  db: DbQueryable,
  cardId: number,
  schedule: CardSchedule,
): Promise<void> {
  await db.query(
    `INSERT INTO card_schedules
       (card_id, due, stability, difficulty, elapsed_days, scheduled_days,
        learning_steps, reps, lapses, state, last_review, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (card_id) DO UPDATE SET
       due = EXCLUDED.due,
       stability = EXCLUDED.stability,
       difficulty = EXCLUDED.difficulty,
       elapsed_days = EXCLUDED.elapsed_days,
       scheduled_days = EXCLUDED.scheduled_days,
       learning_steps = EXCLUDED.learning_steps,
       reps = EXCLUDED.reps,
       lapses = EXCLUDED.lapses,
       state = EXCLUDED.state,
       last_review = EXCLUDED.last_review,
       updated_at = now()`,
    [
      cardId,
      schedule.due,
      schedule.stability,
      schedule.difficulty,
      schedule.elapsedDays,
      schedule.scheduledDays,
      schedule.learningSteps,
      schedule.reps,
      schedule.lapses,
      schedule.state,
      schedule.lastReview,
    ],
  );
}

// One row of review history (see the reviews migration for field semantics).
export interface NewReview {
  cardId: number;
  direction: PromptDirection;
  detectedCorrect: boolean;
  rating: ReviewRating;
  wasDue: boolean;
  reviewedAt: Date;
}

export async function insertReview(db: DbQueryable, review: NewReview): Promise<void> {
  await db.query(
    `INSERT INTO reviews (card_id, direction, detected_correct, rating, was_due, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      review.cardId,
      review.direction,
      review.detectedCorrect,
      review.rating,
      review.wasDue,
      review.reviewedAt,
    ],
  );
}
