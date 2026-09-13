import type { DbPool, DbQueryable } from '../db.js';
import type { Category } from '../categorization/repository.js';

export interface PracticeTargetRef {
  expected: string;
  submitted: string | null;
}

export interface MistakeDetail {
  cardId: number;
  category: Category;
  correctText: string;
  submittedText: string;
  direction: string;
  rationale: string;
  spanishText: string | null;
  englishText: string | null;
  practiceTargets: PracticeTargetRef[];
}

export interface PracticeExample extends MistakeDetail {
  tier: 1 | 2 | 3 | 4;
}

export interface PracticeSentence {
  spanish: string;
  english: string;
}

export interface PracticeSession {
  id: number;
  reviewCategorizationId: number;
  model: string;
  generatedAt: string;
  examples: PracticeExample[];
  sentences: PracticeSentence[];
}

export interface NewPracticeSession {
  reviewCategorizationId: number;
  model: string;
  generatedAt: string;
  examples: PracticeExample[];
  sentences: PracticeSentence[];
}

interface MistakeDetailRow {
  card_id: number;
  category: Category;
  correct_text: string;
  submitted_text: string;
  direction: string;
  rationale: string;
  spanish_text: string | null;
  english_text: string | null;
  practice_targets: PracticeTargetRef[];
}

function toMistakeDetail(row: MistakeDetailRow): MistakeDetail {
  return {
    cardId: row.card_id,
    category: row.category,
    correctText: row.correct_text,
    submittedText: row.submitted_text,
    direction: row.direction,
    rationale: row.rationale,
    spanishText: row.spanish_text,
    englishText: row.english_text,
    practiceTargets: row.practice_targets,
  };
}

// LEFT JOIN to cards is load-bearing, not incidental: review_history.card_id
// is not a real foreign key, so a card can be deleted after the mistake was
// recorded — spanish_text/english_text must be allowed to come back null.
const MISTAKE_DETAIL_SELECT = `
  SELECT rh.card_id, rc.category, rh.correct_text, rh.submitted_text, rh.direction,
         rc.rationale, c.spanish_text, c.english_text,
         COALESCE(pt.targets, '[]') AS practice_targets
  FROM review_categorizations rc
  JOIN review_history rh ON rh.id = rc.review_history_id
  LEFT JOIN cards c ON c.id = rh.card_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('expected', pt.expected, 'submitted', pt.submitted) ORDER BY pt.id) AS targets
    FROM practice_targets pt
    WHERE pt.review_categorization_id = rc.id
  ) pt ON true
`;

export async function getMistakeContext(
  db: DbQueryable,
  reviewCategorizationId: number,
): Promise<MistakeDetail | null> {
  const result = await db.query<MistakeDetailRow>(
    `${MISTAKE_DETAIL_SELECT} WHERE rc.id = $1`,
    [reviewCategorizationId],
  );
  const row = result.rows[0];
  return row ? toMistakeDetail(row) : null;
}

export async function findTier1Candidates(
  db: DbQueryable,
  targets: PracticeTargetRef[],
  excludeCategorizationId: number,
): Promise<MistakeDetail[]> {
  const results: MistakeDetail[] = [];
  for (const target of targets) {
    const result = await db.query<MistakeDetailRow>(
      `${MISTAKE_DETAIL_SELECT}
       WHERE rc.id IN (
         SELECT review_categorization_id FROM practice_targets
         WHERE expected = $1 AND submitted IS NOT DISTINCT FROM $2
       )
       AND rc.id != $3`,
      [target.expected, target.submitted, excludeCategorizationId],
    );
    results.push(...result.rows.map(toMistakeDetail));
  }
  return results;
}

export async function findTier2Candidates(
  db: DbQueryable,
  targets: PracticeTargetRef[],
  excludeCategorizationId: number,
): Promise<MistakeDetail[]> {
  const results: MistakeDetail[] = [];
  for (const target of targets) {
    const result = await db.query<MistakeDetailRow>(
      `${MISTAKE_DETAIL_SELECT}
       WHERE rc.id IN (
         SELECT review_categorization_id FROM practice_targets WHERE expected = $1
       )
       AND rc.id != $2`,
      [target.expected, excludeCategorizationId],
    );
    results.push(...result.rows.map(toMistakeDetail));
  }
  return results;
}

export async function findTier3Candidates(
  db: DbQueryable,
  cardId: number,
  excludeCategorizationId: number,
): Promise<MistakeDetail[]> {
  const result = await db.query<MistakeDetailRow>(
    `${MISTAKE_DETAIL_SELECT} WHERE rh.card_id = $1 AND rc.id != $2`,
    [cardId, excludeCategorizationId],
  );
  return result.rows.map(toMistakeDetail);
}

export async function findTier4Candidates(
  db: DbQueryable,
  category: Category,
  excludeCategorizationId: number,
  sampleSize: number,
): Promise<MistakeDetail[]> {
  const result = await db.query<MistakeDetailRow>(
    `${MISTAKE_DETAIL_SELECT}
     WHERE rc.category = $1 AND rc.id != $2
     ORDER BY random()
     LIMIT $3`,
    [category, excludeCategorizationId, sampleSize],
  );
  return result.rows.map(toMistakeDetail);
}

interface PracticeSessionRow {
  id: number;
  review_categorization_id: number;
  model: string;
  generated_at: string;
  examples_snapshot: PracticeExample[];
  sentences: PracticeSentence[];
}

function toPracticeSession(row: PracticeSessionRow): PracticeSession {
  return {
    id: row.id,
    reviewCategorizationId: row.review_categorization_id,
    model: row.model,
    generatedAt: new Date(row.generated_at).toISOString(),
    examples: row.examples_snapshot,
    sentences: row.sentences,
  };
}

export async function getPracticeSession(
  db: DbQueryable,
  reviewCategorizationId: number,
): Promise<PracticeSession | null> {
  const result = await db.query<PracticeSessionRow>(
    `SELECT id, review_categorization_id, model, generated_at, examples_snapshot, sentences
     FROM practice_sessions WHERE review_categorization_id = $1`,
    [reviewCategorizationId],
  );
  const row = result.rows[0];
  return row ? toPracticeSession(row) : null;
}

export async function upsertPracticeSession(
  db: DbPool,
  input: NewPracticeSession,
): Promise<PracticeSession> {
  const result = await db.query<PracticeSessionRow>(
    `INSERT INTO practice_sessions
       (review_categorization_id, model, generated_at, examples_snapshot, sentences)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (review_categorization_id) DO UPDATE
     SET model = EXCLUDED.model,
         generated_at = EXCLUDED.generated_at,
         examples_snapshot = EXCLUDED.examples_snapshot,
         sentences = EXCLUDED.sentences,
         updated_at = now()
     RETURNING id, review_categorization_id, model, generated_at, examples_snapshot, sentences`,
    [
      input.reviewCategorizationId,
      input.model,
      input.generatedAt,
      JSON.stringify(input.examples),
      JSON.stringify(input.sentences),
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Upsert did not return a row');
  }
  return toPracticeSession(row);
}
