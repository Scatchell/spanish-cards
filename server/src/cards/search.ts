import Fuse from 'fuse.js';
import type { Card } from './repository.js';

export type SearchLanguage = 'english' | 'spanish' | 'both';
export type MatchedField = 'spanishText' | 'englishText';
export type RankReason = 'exact' | 'containment' | 'fuzzy';

export interface CardMatch {
  card: Card;
  matchedField: MatchedField;
  matchedText: string;
  score: number;
  rankReason: RankReason;
}

export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 50;

// Lenient enough to catch near-duplicates ("Helo" → "Hello") while excluding
// unrelated cards. Tuned against the ranking unit tests.
const FUSE_THRESHOLD = 0.35;

// Tier score bands keep the reported score monotonic with the ranking:
// exact = 1, containment in (0.7, 0.9], fuzzy below 0.7.
const CONTAINMENT_BASE_SCORE = 0.9;
const CONTAINMENT_MIN_SCORE = 0.7;
const FUZZY_SCORE_SCALE = 0.7;

export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Candidate {
  card: Card;
  field: MatchedField;
  text: string;
  normalized: string;
}

// Ranked duplicate-check search over card text. Returns at most one match per
// card (its best field), ordered exact > phrase containment > fuzzy typo,
// with everything below the fuzzy threshold excluded.
export function searchCards(
  cards: Card[],
  query: string,
  language: SearchLanguage,
  limit: number = DEFAULT_SEARCH_LIMIT,
): CardMatch[] {
  const normalizedQuery = normalizeForSearch(query);
  const effectiveLimit = Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT));
  if (normalizedQuery.length === 0) {
    return [];
  }

  const fields: MatchedField[] =
    language === 'english'
      ? ['englishText']
      : language === 'spanish'
        ? ['spanishText']
        : ['spanishText', 'englishText'];

  const candidates: Candidate[] = cards.flatMap((card) =>
    fields.map((field) => {
      const text = card[field];
      return { card, field, text, normalized: normalizeForSearch(text) };
    }),
  );

  const exact: CardMatch[] = [];
  const containment: CardMatch[] = [];
  const fuzzyPool: Candidate[] = [];

  for (const candidate of candidates) {
    if (candidate.normalized === normalizedQuery) {
      exact.push(toMatch(candidate, 1, 'exact'));
    } else if (containsPhrase(candidate.normalized, normalizedQuery)) {
      containment.push(toMatch(candidate, containmentScore(candidate.normalized, normalizedQuery), 'containment'));
    } else {
      fuzzyPool.push(candidate);
    }
  }

  // Prefer short direct matches over long incidental ones within the tier.
  containment.sort((a, b) => b.score - a.score);

  const fuse = new Fuse(fuzzyPool, {
    keys: ['normalized'],
    includeScore: true,
    threshold: FUSE_THRESHOLD,
    ignoreLocation: true,
  });
  const fuzzy = fuse
    .search(normalizedQuery)
    .map((result) => toMatch(result.item, FUZZY_SCORE_SCALE * (1 - (result.score ?? 1)), 'fuzzy'));

  const ranked = [...exact, ...containment, ...fuzzy];
  const seen = new Set<number>();
  const matches: CardMatch[] = [];
  for (const match of ranked) {
    if (seen.has(match.card.id)) {
      continue;
    }
    seen.add(match.card.id);
    matches.push(match);
    if (matches.length >= effectiveLimit) {
      break;
    }
  }
  return matches;
}

function toMatch(candidate: Candidate, score: number, rankReason: RankReason): CardMatch {
  return {
    card: candidate.card,
    matchedField: candidate.field,
    matchedText: candidate.text,
    score: Number(score.toFixed(3)),
    rankReason,
  };
}

// Whole-token phrase containment: "hello" is contained in "my favorite word
// is hello" but not in "othello".
function containsPhrase(normalizedText: string, normalizedQuery: string): boolean {
  return ` ${normalizedText} `.includes(` ${normalizedQuery} `);
}

function containmentScore(normalizedText: string, normalizedQuery: string): number {
  const extra = normalizedText.length - normalizedQuery.length;
  const penalty = Math.min(CONTAINMENT_BASE_SCORE - CONTAINMENT_MIN_SCORE, extra / 200);
  return CONTAINMENT_BASE_SCORE - penalty;
}
