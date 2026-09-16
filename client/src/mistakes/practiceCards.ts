import type { Card, PracticeSentenceDto } from '../api.js';

const PRACTICE_LANGUAGE_PAIR = 'en<->es';

// Builds transient, never-persisted Card objects from generated practice
// sentences, so they can be fed into the same client-only Learn session
// machinery used for real cards. Negative ids keep them out of the range of
// real database ids.
export function sentencesToCards(sentences: PracticeSentenceDto[]): Card[] {
  const now = new Date().toISOString();
  return sentences.map((sentence, index) => ({
    id: -(index + 1),
    spanishText: sentence.spanish,
    englishText: sentence.english,
    languagePair: PRACTICE_LANGUAGE_PAIR,
    createdAt: now,
    updatedAt: now,
    due: now,
    reviewed: false,
    spanishAlternates: [],
    englishAlternates: [],
  }));
}
