import type { TrainingCard } from '../api.js';

// Training direction: which language is the prompt. The preference persists
// for the browser session, per the epic requirements.
export type Direction = 'spanish-to-english' | 'english-to-spanish';

const STORAGE_KEY = 'spanish-cards.training-direction';
export const DEFAULT_DIRECTION: Direction = 'english-to-spanish';

export function loadDirection(): Direction {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  return stored === 'english-to-spanish' ? stored : DEFAULT_DIRECTION;
}

export function saveDirection(direction: Direction): void {
  sessionStorage.setItem(STORAGE_KEY, direction);
}

export function oppositeDirection(direction: Direction): Direction {
  return direction === 'spanish-to-english' ? 'english-to-spanish' : 'spanish-to-english';
}

export function promptText(card: TrainingCard, direction: Direction): string {
  return direction === 'spanish-to-english' ? card.spanishText : card.englishText;
}

export function answerText(card: TrainingCard, direction: Direction): string {
  return direction === 'spanish-to-english' ? card.englishText : card.spanishText;
}
