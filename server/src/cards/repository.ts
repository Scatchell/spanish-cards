import type { DbPool } from '../db.js';
import type { CardInput } from './validation.js';

export interface Card {
  id: number;
  spanishText: string;
  englishText: string;
  createdAt: string;
  updatedAt: string;
}

interface CardRow {
  id: number;
  spanish_text: string;
  english_text: string;
  created_at: Date;
  updated_at: Date;
}

export async function listCards(pool: DbPool): Promise<Card[]> {
  const result = await pool.query<CardRow>(
    'SELECT id, spanish_text, english_text, created_at, updated_at FROM cards ORDER BY created_at DESC, id DESC',
  );
  return result.rows.map(toCard);
}

export async function insertCards(pool: DbPool, inputs: CardInput[]): Promise<Card[]> {
  if (inputs.length === 0) {
    return [];
  }
  const values: string[] = [];
  const params: string[] = [];
  inputs.forEach((input, i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(input.spanishText, input.englishText);
  });
  const result = await pool.query<CardRow>(
    `INSERT INTO cards (spanish_text, english_text) VALUES ${values.join(', ')}
     RETURNING id, spanish_text, english_text, created_at, updated_at`,
    params,
  );
  return result.rows.map(toCard);
}

export async function deleteCard(pool: DbPool, id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM cards WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    spanishText: row.spanish_text,
    englishText: row.english_text,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
