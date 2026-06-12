import type { DbQueryable } from '../db.js';

export interface Explanation {
  id: number;
  spanishText: string;
  englishText: string;
  contentMarkdown: string;
  model: string;
  createdAt: string;
}

export interface NewExplanation {
  spanishText: string;
  englishText: string;
  contentMarkdown: string;
  model: string;
}

interface ExplanationRow {
  id: number;
  spanish_text: string;
  english_text: string;
  content_markdown: string;
  model: string;
  created_at: Date;
}

function toExplanation(row: ExplanationRow): Explanation {
  return {
    id: row.id,
    spanishText: row.spanish_text,
    englishText: row.english_text,
    contentMarkdown: row.content_markdown,
    model: row.model,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findExplanation(
  db: DbQueryable,
  spanishText: string,
  englishText: string,
): Promise<Explanation | null> {
  const result = await db.query<ExplanationRow>(
    `SELECT id, spanish_text, english_text, content_markdown, model, created_at
     FROM explanations
     WHERE spanish_text = $1 AND english_text = $2`,
    [spanishText, englishText],
  );
  return result.rows[0] ? toExplanation(result.rows[0]) : null;
}

export async function insertExplanation(
  db: DbQueryable,
  input: NewExplanation,
): Promise<Explanation> {
  const result = await db.query<ExplanationRow>(
    `INSERT INTO explanations (spanish_text, english_text, content_markdown, model)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (spanish_text, english_text) DO NOTHING
     RETURNING id, spanish_text, english_text, content_markdown, model, created_at`,
    [input.spanishText, input.englishText, input.contentMarkdown, input.model],
  );
  if (result.rows[0]) {
    return toExplanation(result.rows[0]);
  }
  // Concurrent insert won; return the existing row.
  const existing = await findExplanation(db, input.spanishText, input.englishText);
  if (!existing) {
    throw new Error('Explanation not found after conflict');
  }
  return existing;
}
