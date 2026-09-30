import type { DbQueryable } from '../db.js';
import type { ReviewEvent } from './metrics.js';

interface ReviewRow {
  card_id: number;
  detected_correct: boolean;
  reviewed_at: Date;
}

// All of one user's reviews, oldest first. The whole table is loaded because
// the metrics need per-day buckets over all time; for a single user reviewing
// a personal deck this stays small.
export async function getAllReviews(db: DbQueryable, userId: number): Promise<ReviewEvent[]> {
  const result = await db.query<ReviewRow>(
    `SELECT r.card_id, r.detected_correct, r.reviewed_at
     FROM reviews r
     JOIN cards c ON c.id = r.card_id
     WHERE c.user_id = $1
     ORDER BY r.reviewed_at ASC, r.id ASC`,
    [userId],
  );
  return result.rows.map((row) => ({
    cardId: row.card_id,
    detectedCorrect: row.detected_correct,
    reviewedAt: row.reviewed_at,
  }));
}

export async function countCards(db: DbQueryable, userId: number): Promise<number> {
  const result = await db.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM cards WHERE user_id = $1',
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

// Card counts grouped by raw FSRS state; state is null for cards that have
// never been reviewed (no schedule row).
export async function countCardsByState(
  db: DbQueryable,
  userId: number,
): Promise<{ state: number | null; count: number }[]> {
  const result = await db.query<{ state: number | null; count: number }>(
    `SELECT s.state AS state, COUNT(*)::int AS count
     FROM cards c
     LEFT JOIN card_schedules s ON s.card_id = c.id
     WHERE c.user_id = $1
     GROUP BY s.state`,
    [userId],
  );
  return result.rows;
}
