import { stripDiacritics } from '../text/diacritics.js';

// Deliberately lighter than normalizeForSearch/normalizeSubmitted: only
// lowercase + strip accents + collapse whitespace, no punctuation removal.
// This is for exact-repeat detection ("did the user make this exact mistake
// before"), not fuzzy matching, so over-normalizing would hide real
// differences (e.g. a dropped question mark being part of the mistake).
export function normalizeForDedup(text: string): string {
  return stripDiacritics(text.toLowerCase()).replace(/\s+/g, ' ').trim();
}

export function dedupKey(correctText: string, submittedText: string): string {
  return `${normalizeForDedup(correctText)} ${normalizeForDedup(submittedText)}`;
}
