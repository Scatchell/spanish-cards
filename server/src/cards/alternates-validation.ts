import { CARD_TEXT_MAX_LENGTH } from './validation.js';
import { normalizeSubmitted } from '../explanations/normalize.js';
import type { AlternateField } from './alternates-repository.js';

export const MAX_ALTERNATES_PER_FIELD = 5;

export function isAlternateField(value: unknown): value is AlternateField {
  return value === 'spanish' || value === 'english';
}

export function validateAlternateText(text: string): string[] {
  const value = text.trim();
  if (value.length === 0) {
    return ['Alternate text is required'];
  }
  if (/[\r\n]/.test(text)) {
    return ['Alternate text must be a single line'];
  }
  if (value.length > CARD_TEXT_MAX_LENGTH) {
    return [`Alternate text must be ${CARD_TEXT_MAX_LENGTH} characters or fewer`];
  }
  return [];
}

// Mirrors the client-side dedupe rule: same normalization the answer checker
// uses, so "Coche" and "coche " are treated as the same alternate.
export function isDuplicateAnswer(candidate: string, existing: string[]): boolean {
  const normalizedCandidate = normalizeSubmitted(candidate);
  return existing.some((text) => normalizeSubmitted(text) === normalizedCandidate);
}
