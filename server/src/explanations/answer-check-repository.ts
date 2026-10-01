import type { DbQueryable } from '../db.js';
import type { SubmittedReading } from './llm.js';

export type AnswerCheckDirection = 'spanish-to-english' | 'english-to-spanish';
export type AnswerCheckVerdict = 'valid' | 'invalid';

export interface AnswerCheck {
  id: number;
  spanishText: string;
  englishText: string;
  direction: AnswerCheckDirection;
  submittedNormalized: string;
  verdict: AnswerCheckVerdict;
  suggestedAnswer: string | null;
  feedbackPoints: string[];
  submittedReading: SubmittedReading | null;
  model: string;
  createdAt: string;
}

export interface NewAnswerCheck {
  spanishText: string;
  englishText: string;
  direction: AnswerCheckDirection;
  submittedNormalized: string;
  verdict: AnswerCheckVerdict;
  suggestedAnswer: string | null;
  feedbackPoints: string[];
  submittedReading: SubmittedReading | null;
  model: string;
  promptVersion: number;
}

// The tuple that uniquely identifies a cached answer-check row.
export interface AnswerCheckKey {
  spanishText: string;
  englishText: string;
  direction: AnswerCheckDirection;
  submittedNormalized: string;
  // Rows from an older answer-check prompt are never served.
  promptVersion: number;
}

interface AnswerCheckRow {
  id: number;
  spanish_text: string;
  english_text: string;
  direction: string;
  submitted_normalized: string;
  verdict: string;
  suggested_answer: string | null;
  feedback_points: string[];
  submitted_reading: SubmittedReading | null;
  model: string;
  created_at: Date;
}

function toAnswerCheck(row: AnswerCheckRow): AnswerCheck {
  return {
    id: row.id,
    spanishText: row.spanish_text,
    englishText: row.english_text,
    direction: row.direction as AnswerCheckDirection,
    submittedNormalized: row.submitted_normalized,
    verdict: row.verdict as AnswerCheckVerdict,
    suggestedAnswer: row.suggested_answer,
    feedbackPoints: row.feedback_points,
    submittedReading: row.submitted_reading,
    model: row.model,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findAnswerCheck(
  db: DbQueryable,
  key: AnswerCheckKey,
): Promise<AnswerCheck | null> {
  const result = await db.query<AnswerCheckRow>(
    `SELECT id, spanish_text, english_text, direction, submitted_normalized,
            verdict, suggested_answer, feedback_points, submitted_reading, model, created_at
     FROM answer_checks
     WHERE spanish_text = $1 AND english_text = $2
       AND direction = $3 AND submitted_normalized = $4
       AND prompt_version = $5`,
    [key.spanishText, key.englishText, key.direction, key.submittedNormalized, key.promptVersion],
  );
  return result.rows[0] ? toAnswerCheck(result.rows[0]) : null;
}

export async function insertAnswerCheck(
  db: DbQueryable,
  input: NewAnswerCheck,
): Promise<AnswerCheck> {
  const result = await db.query<AnswerCheckRow>(
    `INSERT INTO answer_checks
       (spanish_text, english_text, direction, submitted_normalized,
        verdict, suggested_answer, critique_markdown, feedback_points, submitted_reading,
        model, prompt_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (spanish_text, english_text, direction, submitted_normalized, prompt_version)
       DO NOTHING
     RETURNING id, spanish_text, english_text, direction, submitted_normalized,
               verdict, suggested_answer, feedback_points, submitted_reading, model, created_at`,
    [
      input.spanishText,
      input.englishText,
      input.direction,
      input.submittedNormalized,
      input.verdict,
      input.suggestedAnswer,
      // Legacy NOT NULL column, no longer read: kept populated so it can be
      // dropped in a later migration without a backfill.
      input.feedbackPoints.map((point) => `- ${point}`).join('\n'),
      JSON.stringify(input.feedbackPoints),
      input.submittedReading ? JSON.stringify(input.submittedReading) : null,
      input.model,
      input.promptVersion,
    ],
  );
  if (result.rows[0]) {
    return toAnswerCheck(result.rows[0]);
  }
  // Concurrent insert won; return the existing row.
  const existing = await findAnswerCheck(db, {
    spanishText: input.spanishText,
    englishText: input.englishText,
    direction: input.direction,
    submittedNormalized: input.submittedNormalized,
    promptVersion: input.promptVersion,
  });
  if (!existing) {
    throw new Error('Answer check not found after conflict');
  }
  return existing;
}
