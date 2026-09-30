import type { DbQueryable } from '../db.js';
import type { AlternateField } from './alternates-repository.js';
import type { CardInput } from './validation.js';

export interface CardAlternate {
  id: number;
  text: string;
}

export interface Card {
  id: number;
  spanishText: string;
  englishText: string;
  languagePair: string;
  createdAt: string;
  updatedAt: string;
  // Effective due time: the FSRS due date, or createdAt for a card that has
  // never been reviewed (same rule as the training queue).
  due: string;
  reviewed: boolean;
  spanishAlternates: CardAlternate[];
  englishAlternates: CardAlternate[];
}

interface CardRow {
  id: number;
  spanish_text: string;
  english_text: string;
  language_pair: string;
  created_at: Date;
  updated_at: Date;
  due: Date;
  reviewed: boolean;
  spanish_alternates: CardAlternate[];
  english_alternates: CardAlternate[];
}

// json_agg/json_build_object (not array_agg) since alternates are structured
// objects; pg parses the returned json/json[] column into plain JS
// objects/arrays automatically.
const ALTERNATES_SELECT = `
            COALESCE((SELECT json_agg(json_build_object('id', a.id, 'text', a.text) ORDER BY a.position)
                      FROM card_alternate_answers a
                      WHERE a.card_id = c.id AND a.field = 'spanish'), '[]'::json) AS spanish_alternates,
            COALESCE((SELECT json_agg(json_build_object('id', a.id, 'text', a.text) ORDER BY a.position)
                      FROM card_alternate_answers a
                      WHERE a.card_id = c.id AND a.field = 'english'), '[]'::json) AS english_alternates`;

export async function listCards(db: DbQueryable, userId: number): Promise<Card[]> {
  const result = await db.query<CardRow>(
    `SELECT c.id, c.spanish_text, c.english_text, c.language_pair, c.created_at, c.updated_at,
            COALESCE(s.due, c.created_at) AS due,
            (s.card_id IS NOT NULL) AS reviewed,${ALTERNATES_SELECT}
     FROM cards c
     LEFT JOIN card_schedules s ON s.card_id = c.id
     WHERE c.user_id = $1
     ORDER BY c.id`,
    [userId],
  );
  return result.rows.map(toCard);
}

// Run in a transaction when inputs carry alternates, so no card saves without them.
export async function insertCards(db: DbQueryable, userId: number, inputs: CardInput[]): Promise<Card[]> {
  if (inputs.length === 0) {
    return [];
  }
  const values: string[] = [];
  const params: (number | string)[] = [userId];
  inputs.forEach((input, i) => {
    values.push(`($1, $${i * 2 + 2}, $${i * 2 + 3})`);
    params.push(input.spanishText, input.englishText);
  });
  // New cards have no schedule yet: due now (created_at), never reviewed.
  const result = await db.query<CardRow>(
    `INSERT INTO cards (user_id, spanish_text, english_text) VALUES ${values.join(', ')}
     RETURNING id, spanish_text, english_text, language_pair, created_at, updated_at,
               created_at AS due, false AS reviewed,
               '[]'::json AS spanish_alternates, '[]'::json AS english_alternates`,
    params,
  );
  const cards = result.rows.map(toCard);
  await insertInitialAlternates(db, cards, inputs);
  return cards;
}

async function insertInitialAlternates(db: DbQueryable, cards: Card[], inputs: CardInput[]): Promise<void> {
  const values: string[] = [];
  const params: (number | string)[] = [];
  cards.forEach((card, i) => {
    const input = inputs[i]!;
    const fields: [AlternateField, string[]][] = [
      ['spanish', input.spanishAlternates ?? []],
      ['english', input.englishAlternates ?? []],
    ];
    for (const [field, texts] of fields) {
      texts.forEach((text, position) => {
        const n = params.length;
        values.push(`($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4})`);
        params.push(card.id, field, text, position);
      });
    }
  });
  if (values.length === 0) {
    return;
  }
  const result = await db.query<{ id: number; card_id: number; field: AlternateField; text: string }>(
    `INSERT INTO card_alternate_answers (card_id, field, text, position) VALUES ${values.join(', ')}
     RETURNING id, card_id, field, text`,
    params,
  );
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const row of result.rows) {
    const card = byId.get(row.card_id)!;
    const target = row.field === 'spanish' ? card.spanishAlternates : card.englishAlternates;
    target.push({ id: row.id, text: row.text });
  }
}

export async function getCard(db: DbQueryable, userId: number, id: number): Promise<Card | null> {
  const result = await db.query<CardRow>(
    `SELECT c.id, c.spanish_text, c.english_text, c.language_pair, c.created_at, c.updated_at,
            COALESCE(s.due, c.created_at) AS due,
            (s.card_id IS NOT NULL) AS reviewed,${ALTERNATES_SELECT}
     FROM cards c
     LEFT JOIN card_schedules s ON s.card_id = c.id
     WHERE c.id = $1 AND c.user_id = $2`,
    [id, userId],
  );
  return result.rows[0] ? toCard(result.rows[0]) : null;
}

export async function updateCard(
  db: DbQueryable,
  userId: number,
  id: number,
  input: CardInput,
): Promise<Card | null> {
  // cards.updated_at has no update trigger, so set it explicitly here.
  const result = await db.query(
    `UPDATE cards SET spanish_text = $1, english_text = $2, updated_at = now()
     WHERE id = $3 AND user_id = $4`,
    [input.spanishText, input.englishText, id, userId],
  );
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  // Re-read so due/reviewed reflect the (untouched) schedule join.
  return getCard(db, userId, id);
}

export async function deleteCard(db: DbQueryable, userId: number, id: number): Promise<boolean> {
  const result = await db.query('DELETE FROM cards WHERE id = $1 AND user_id = $2', [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    spanishText: row.spanish_text,
    englishText: row.english_text,
    languagePair: row.language_pair,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    due: row.due.toISOString(),
    reviewed: row.reviewed,
    spanishAlternates: row.spanish_alternates,
    englishAlternates: row.english_alternates,
  };
}
