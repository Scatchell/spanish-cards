import type { DbQueryable } from '../db.js';

export interface Explanation {
  id: number;
  spanishText: string;
  englishText: string;
  contentMarkdown: string;
  model: string;
  promptVersion: string;
  createdAt: string;
}

export interface NewExplanation {
  spanishText: string;
  englishText: string;
  contentMarkdown: string;
  model: string;
  promptVersion: string;
}

interface ExplanationRow {
  id: number;
  spanish_text: string;
  english_text: string;
  content_markdown: string;
  model: string;
  prompt_version: string;
  created_at: Date;
}

function toExplanation(row: ExplanationRow): Explanation {
  return {
    id: row.id,
    spanishText: row.spanish_text,
    englishText: row.english_text,
    contentMarkdown: row.content_markdown,
    model: row.model,
    promptVersion: row.prompt_version,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findExplanation(
  db: DbQueryable,
  spanishText: string,
  englishText: string,
): Promise<Explanation | null> {
  const result = await db.query<ExplanationRow>(
    `SELECT id, spanish_text, english_text, content_markdown, model, prompt_version, created_at
     FROM explanations
     WHERE spanish_text = $1 AND english_text = $2`,
    [spanishText, englishText],
  );
  return result.rows[0] ? toExplanation(result.rows[0]) : null;
}

// One row per (spanish, english): regenerating after a prompt/model change
// overwrites the row rather than keeping superseded output. created_at is
// reset because it records when this content was generated. Concurrent
// regenerations are last-write-wins — both results are current.
export async function upsertExplanation(
  db: DbQueryable,
  input: NewExplanation,
): Promise<Explanation> {
  const result = await db.query<ExplanationRow>(
    `INSERT INTO explanations (spanish_text, english_text, content_markdown, model, prompt_version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (spanish_text, english_text) DO UPDATE SET
       content_markdown = EXCLUDED.content_markdown,
       model = EXCLUDED.model,
       prompt_version = EXCLUDED.prompt_version,
       created_at = now()
     RETURNING id, spanish_text, english_text, content_markdown, model, prompt_version, created_at`,
    [input.spanishText, input.englishText, input.contentMarkdown, input.model, input.promptVersion],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Explanation upsert returned no row');
  }
  return toExplanation(row);
}
