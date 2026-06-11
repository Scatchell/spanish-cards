import type { DbQueryable } from '../db.js';
import type { CardInput } from './validation.js';

export interface Card {
  id: number;
  spanishText: string;
  englishText: string;
  createdAt: string;
  updatedAt: string;
  // Effective due time: the FSRS due date, or createdAt for a card that has
  // never been reviewed (same rule as the training queue).
  due: string;
  reviewed: boolean;
}

interface CardRow {
  id: number;
  spanish_text: string;
  english_text: string;
  created_at: Date;
  updated_at: Date;
  due: Date;
  reviewed: boolean;
}

export async function listCards(db: DbQueryable): Promise<Card[]> {
  const result = await db.query<CardRow>(
    `SELECT c.id, c.spanish_text, c.english_text, c.created_at, c.updated_at,
            COALESCE(s.due, c.created_at) AS due,
            (s.card_id IS NOT NULL) AS reviewed
     FROM cards c
     LEFT JOIN card_schedules s ON s.card_id = c.id
     ORDER BY c.created_at DESC, c.id DESC`,
  );
  return result.rows.map(toCard);
}

export async function insertCards(db: DbQueryable, inputs: CardInput[]): Promise<Card[]> {
  if (inputs.length === 0) {
    return [];
  }
  const values: string[] = [];
  const params: string[] = [];
  inputs.forEach((input, i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(input.spanishText, input.englishText);
  });
  // New cards have no schedule yet: due now (created_at), never reviewed.
  const result = await db.query<CardRow>(
    `INSERT INTO cards (spanish_text, english_text) VALUES ${values.join(', ')}
     RETURNING id, spanish_text, english_text, created_at, updated_at,
               created_at AS due, false AS reviewed`,
    params,
  );
  return result.rows.map(toCard);
}

export async function deleteCard(db: DbQueryable, id: number): Promise<boolean> {
  const result = await db.query('DELETE FROM cards WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    spanishText: row.spanish_text,
    englishText: row.english_text,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    due: row.due.toISOString(),
    reviewed: row.reviewed,
  };
}
