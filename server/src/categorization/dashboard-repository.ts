import type { DbQueryable } from '../db.js';
import type { Category } from './repository.js';
import { CATEGORIES } from './repository.js';

export interface CategoryCount {
  category: Category;
  count: number;
}

export interface PracticeTarget {
  expected: string;
  submitted: string | null;
}

export interface CategoryMistake {
  id: number;
  category: Category;
  rationale: string;
  practiceTargets: PracticeTarget[];
  correctText: string;
  submittedText: string;
  direction: string;
  verdict: string;
  createdAt: string;
}

export interface MistakesPage {
  items: CategoryMistake[];
  nextCursor: string | null;
}

export interface MistakesCursor {
  createdAt: string;
  id: number;
}

interface CountRow {
  category: Category;
  count: string;
}

// One GROUP BY query merged with the fixed nine-category list, so a category
// with zero rows still appears (the client never special-cases a missing key).
export async function getCategorySummary(db: DbQueryable): Promise<CategoryCount[]> {
  const result = await db.query<CountRow>(
    'SELECT category, COUNT(*) AS count FROM review_categorizations GROUP BY category',
  );
  const counts = new Map(result.rows.map((row) => [row.category, Number(row.count)]));
  return CATEGORIES.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

interface MistakeRow {
  id: number;
  category: Category;
  rationale: string;
  practice_targets: PracticeTarget[];
  correct_text: string;
  submitted_text: string;
  direction: string;
  verdict: string;
  created_at: string;
}

function toCategoryMistake(row: MistakeRow): CategoryMistake {
  return {
    id: row.id,
    category: row.category,
    rationale: row.rationale,
    practiceTargets: row.practice_targets,
    correctText: row.correct_text,
    submittedText: row.submitted_text,
    direction: row.direction,
    verdict: row.verdict,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// Keyset pagination on (created_at DESC, id DESC): created_at alone isn't
// unique enough (a batch insert can share a millisecond timestamp), so id
// breaks ties deterministically without skipping or repeating rows across
// pages, and without an OFFSET that new inserts could shift underneath us.
export async function getCategoryMistakes(
  db: DbQueryable,
  category: Category,
  opts: { cursor: MistakesCursor | null; limit: number },
): Promise<MistakesPage> {
  const params: unknown[] = [category];
  let cursorClause = '';
  if (opts.cursor) {
    params.push(opts.cursor.createdAt, opts.cursor.id);
    cursorClause = `AND (rc.created_at, rc.id) < ($2, $3)`;
  }
  params.push(opts.limit);
  const limitParamIndex = params.length;

  const result = await db.query<MistakeRow>(
    `SELECT rc.id, rc.category, rc.rationale, rc.created_at,
            rh.correct_text, rh.submitted_text, rh.direction, rh.verdict,
            COALESCE(pt.targets, '[]') AS practice_targets
     FROM review_categorizations rc
     JOIN review_history rh ON rh.id = rc.review_history_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object('expected', pt.expected, 'submitted', pt.submitted) ORDER BY pt.id) AS targets
       FROM practice_targets pt
       WHERE pt.review_categorization_id = rc.id
     ) pt ON true
     WHERE rc.category = $1
     ${cursorClause}
     ORDER BY rc.created_at DESC, rc.id DESC
     LIMIT $${limitParamIndex}`,
    params,
  );

  const items = result.rows.map(toCategoryMistake);
  const last = items[items.length - 1];
  const nextCursor = items.length === opts.limit && last ? `${last.createdAt},${last.id}` : null;
  return { items, nextCursor };
}

export function parseCursor(raw: string): MistakesCursor | null {
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  const [createdAt, idStr] = parts;
  const id = Number(idStr);
  if (!createdAt || !Number.isInteger(id)) return null;
  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return { createdAt, id };
}
