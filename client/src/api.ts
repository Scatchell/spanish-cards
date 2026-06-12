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

export interface TrainingCard {
  id: number;
  spanishText: string;
  englishText: string;
  languagePair: string;
  due: string;
}

export type TrainingScope = 'due' | 'ahead';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewSubmission {
  cardId: number;
  rating: ReviewRating;
  direction: 'spanish-to-english' | 'english-to-spanish';
  // Whether answer matching judged the typed answer correct, before any
  // manual rating override.
  detectedCorrect: boolean;
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

export function fetchExplanation(cardId: number, signal?: AbortSignal): Promise<ExplanationResponse> {
  return request(`/api/cards/${cardId}/explanation`, { method: 'POST', signal });
}

export function fetchProgress(): Promise<ProgressSummary> {
  // The server buckets days in local time using this offset (minutes ahead
  // of UTC, the negation of Date#getTimezoneOffset).
  const tzOffset = -new Date().getTimezoneOffset();
  return request(`/api/progress?tzOffset=${tzOffset}`);
}
