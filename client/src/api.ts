export interface Card {
  id: number;
  spanishText: string;
  englishText: string;
  createdAt: string;
  updatedAt: string;
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
