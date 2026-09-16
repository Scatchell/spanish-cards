import type { Verdict } from './training/answer-check.js';

export interface Card {
  id: number;
  spanishText: string;
  englishText: string;
  languagePair: string;
  createdAt: string;
  updatedAt: string;
  // Effective due time: FSRS due date, or createdAt if never reviewed.
  due: string;
  reviewed: boolean;
}

export interface CardDraftInput {
  spanishText: string;
  englishText: string;
}

export interface CardValidationError {
  field: 'spanishText' | 'englishText';
  message: string;
}

export interface BatchFailure {
  index: number;
  errors: CardValidationError[];
}

export interface BatchSaveResult {
  saved: Card[];
  failures: BatchFailure[];
}

export interface TrainingAlternate {
  id: number;
  text: string;
}

export interface TrainingCard {
  id: number;
  spanishText: string;
  englishText: string;
  languagePair: string;
  due: string;
  spanishAlternates: TrainingAlternate[];
  englishAlternates: TrainingAlternate[];
}

export type TrainingScope = 'due' | 'ahead';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewSubmission {
  cardId: number;
  rating: ReviewRating;
  direction: 'spanish-to-english' | 'english-to-spanish';
  // The answer-checker's three-state verdict. The server derives its own
  // detectedCorrect from this.
  verdict: Verdict;
  // The raw text the user typed (may be empty).
  submittedText: string;
}

export interface DayActivity {
  date: string;
  reviews: number;
  correct: number;
  cardsStudiedToDate: number;
}

export interface ProgressSummary {
  totalCards: number;
  dueNow: number;
  stages: { new: number; learning: number; review: number };
  reviewedToday: number;
  correctRateToday: number | null;
  averageDailyCorrectRate: number | null;
  streakDays: number;
  lastStudiedAt: string | null;
  recentDays: DayActivity[];
}

export type Category =
  | 'vocabulary'
  | 'verb_form'
  | 'agreement'
  | 'grammar_words'
  | 'word_order'
  | 'missing_extra_meaning'
  | 'spelling_accents'
  | 'idiom'
  | 'recall_failure';

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

export interface MistakesPageResponse {
  items: CategoryMistake[];
  nextCursor: string | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function getMe(): Promise<{ authenticated: boolean }> {
  return request('/api/me');
}

export function login(username: string, password: string): Promise<{ ok: boolean }> {
  return request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function logout(): Promise<{ ok: boolean }> {
  return request('/api/logout', { method: 'POST' });
}

export async function listCards(): Promise<Card[]> {
  const { cards } = await request<{ cards: Card[] }>('/api/cards');
  return cards;
}

export function saveCardBatch(cards: CardDraftInput[]): Promise<BatchSaveResult> {
  return request('/api/cards/batch', { method: 'POST', body: JSON.stringify({ cards }) });
}

export async function updateCardText(id: number, input: CardDraftInput): Promise<Card> {
  const { card } = await request<{ card: Card }>(`/api/cards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return card;
}

export function deleteCardById(id: number): Promise<void> {
  return request(`/api/cards/${id}`, { method: 'DELETE' });
}

export async function fetchTrainingQueue(scope: TrainingScope): Promise<TrainingCard[]> {
  const { cards } = await request<{ cards: TrainingCard[] }>(`/api/training/queue?scope=${scope}`);
  return cards;
}

export function submitReview(review: ReviewSubmission): Promise<{ schedule: { due: string } }> {
  return request('/api/training/reviews', {
    method: 'POST',
    body: JSON.stringify(review),
  });
}

export interface ExplanationResponse {
  explanation: { contentMarkdown: string; model: string; createdAt: string };
  source: 'cached' | 'generated';
}

// Sent on every call so a transient (non-positive id) card — e.g. a practice
// sentence never persisted server-side — still works: the server looks the
// card up by id when positive, and falls back to this text otherwise.
export interface CardText {
  spanishText: string;
  englishText: string;
}

export function fetchExplanation(
  cardId: number,
  cardText: CardText,
  signal?: AbortSignal,
): Promise<ExplanationResponse> {
  return request(`/api/cards/${cardId}/explanation`, {
    method: 'POST',
    body: JSON.stringify(cardText),
    signal,
  });
}

export interface FollowUpResponse {
  answerMarkdown: string;
}

export function askFollowUp(
  cardId: number,
  cardText: CardText,
  question: string,
  explanationMarkdown: string,
  signal?: AbortSignal,
): Promise<FollowUpResponse> {
  return request(`/api/cards/${cardId}/explanation/follow-up`, {
    method: 'POST',
    body: JSON.stringify({ ...cardText, question, explanationMarkdown }),
    signal,
  });
}

export interface AnswerCheckResponse {
  answerCheck: {
    verdict: 'valid' | 'invalid';
    suggestedAnswer: string | null;
    critiqueMarkdown: string;
    createdAt: string;
  };
  source: 'cached' | 'generated';
}

export function checkSubmittedAnswer(
  cardId: number,
  cardText: CardText,
  submittedAnswer: string,
  direction: 'spanish-to-english' | 'english-to-spanish',
  signal?: AbortSignal,
): Promise<AnswerCheckResponse> {
  return request(`/api/cards/${cardId}/explanation/answer-check`, {
    method: 'POST',
    body: JSON.stringify({ ...cardText, submittedAnswer, direction }),
    signal,
  });
}

export function fetchProgress(): Promise<ProgressSummary> {
  // The server buckets days in local time using this offset (minutes ahead
  // of UTC, the negation of Date#getTimezoneOffset).
  const tzOffset = -new Date().getTimezoneOffset();
  return request(`/api/progress?tzOffset=${tzOffset}`);
}

export function fetchCategorizationSummary(): Promise<{ categories: CategoryCount[] }> {
  return request('/api/categorization/summary');
}

export function fetchCategorizationMistakes(
  category: Category,
  cursor: string | null,
  limit = 50,
): Promise<MistakesPageResponse> {
  const params = new URLSearchParams({ category, limit: String(limit) });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return request(`/api/categorization/mistakes?${params.toString()}`);
}

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

export interface PracticeExampleDto extends MistakeDetail {
  tier: 1 | 2 | 3 | 4;
}

export interface PracticeSentenceDto {
  spanish: string;
  english: string;
}

export interface PracticeSessionDto {
  id: number;
  reviewCategorizationId: number;
  model: string;
  generatedAt: string;
  examples: PracticeExampleDto[];
  sentences: PracticeSentenceDto[];
}

export async function fetchPracticeSession(categorizationId: number): Promise<PracticeSessionDto | null> {
  try {
    const { session } = await request<{ session: PracticeSessionDto }>(`/api/practice/${categorizationId}`);
    return session;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function generatePracticeSession(categorizationId: number): Promise<PracticeSessionDto> {
  const { session } = await request<{ session: PracticeSessionDto }>(`/api/practice/${categorizationId}`, {
    method: 'POST',
  });
  return session;
}
