import type { DbQueryable } from '../db.js';

export type AlternateField = 'spanish' | 'english';

export interface AlternateAnswer {
  id: number;
  cardId: number;
  field: AlternateField;
  text: string;
  position: number;
}

interface AlternateRow {
  id: number;
  card_id: number;
  field: AlternateField;
  text: string;
  position: number;
}

function toAlternate(row: AlternateRow): AlternateAnswer {
  return {
    id: row.id,
    cardId: row.card_id,
    field: row.field,
    text: row.text,
    position: row.position,
  };
}

export async function listAlternatesForField(
  db: DbQueryable,
  cardId: number,
  field: AlternateField,
): Promise<AlternateAnswer[]> {
  const result = await db.query<AlternateRow>(
    `SELECT id, card_id, field, text, position
     FROM card_alternate_answers
     WHERE card_id = $1 AND field = $2
     ORDER BY position ASC`,
    [cardId, field],
  );
  return result.rows.map(toAlternate);
}

export async function insertAlternate(
  db: DbQueryable,
  cardId: number,
  field: AlternateField,
  text: string,
): Promise<AlternateAnswer> {
  const result = await db.query<AlternateRow>(
    `INSERT INTO card_alternate_answers (card_id, field, text, position)
     VALUES ($1, $2::text, $3,
       COALESCE((SELECT MAX(position) + 1 FROM card_alternate_answers WHERE card_id = $1 AND field = $2::text), 0))
     RETURNING id, card_id, field, text, position`,
    [cardId, field, text],
  );
  return toAlternate(result.rows[0]!);
}

export async function getAlternate(db: DbQueryable, id: number): Promise<AlternateAnswer | null> {
  const result = await db.query<AlternateRow>(
    `SELECT id, card_id, field, text, position FROM card_alternate_answers WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? toAlternate(result.rows[0]) : null;
}

export async function updateAlternateText(
  db: DbQueryable,
  id: number,
  text: string,
): Promise<AlternateAnswer | null> {
  const result = await db.query<AlternateRow>(
    `UPDATE card_alternate_answers SET text = $1 WHERE id = $2
     RETURNING id, card_id, field, text, position`,
    [text, id],
  );
  return result.rows[0] ? toAlternate(result.rows[0]) : null;
}

export async function deleteAlternate(db: DbQueryable, id: number): Promise<boolean> {
  const result = await db.query('DELETE FROM card_alternate_answers WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
