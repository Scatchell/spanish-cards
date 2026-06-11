import type { DbPool } from '../db.js';
import type { CardSchedule } from './scheduler.js';

// A card as presented in the training queue. `due` is the effective due time:
// the FSRS due date, or the card's creation time if it has never been reviewed.
export interface TrainingCard {
  id: number;
  spanishText: string;
  englishText: string;
  due: string;
}

export type QueueScope = 'due' | 'ahead';

interface QueueRow {
  id: number;
  spanish_text: string;
  english_text: string;
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
  pool: DbPool,
  scope: QueueScope,
  now: Date,
): Promise<TrainingCard[]> {
  const comparison = scope === 'due' ? '<=' : '>';
  const result = await pool.query<QueueRow>(
    `SELECT c.id, c.spanish_text, c.english_text, COALESCE(s.due, c.created_at) AS due
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
    due: row.due.toISOString(),
  }));
}

export async function cardExists(pool: DbPool, cardId: number): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM cards WHERE id = $1', [cardId]);
  return (result.rowCount ?? 0) > 0;
}

export async function getSchedule(pool: DbPool, cardId: number): Promise<CardSchedule | null> {
  const result = await pool.query<ScheduleRow>(
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
  pool: DbPool,
  cardId: number,
  schedule: CardSchedule,
): Promise<void> {
  await pool.query(
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
