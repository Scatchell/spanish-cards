import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  SERVER_UNAVAILABLE_MESSAGE,
  ServerUnavailableError,
  describeError,
  getMe,
  submitReviews,
} from '../src/api.js';

afterEach(() => vi.unstubAllGlobals());

describe('request failures', () => {
  it('turns a rejected fetch into ServerUnavailableError with the standard message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await getMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServerUnavailableError);
    expect((error as Error).message).toBe(
      'The server is not available for this action. Check your internet connection and try again.',
    );
    expect((error as Error).message).toBe(SERVER_UNAVAILABLE_MESSAGE);
  });

  it('passes an AbortError through untouched so callers can ignore cancellations', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(getMe()).rejects.toBe(abort);
  });

  it('keeps HTTP errors as ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status: 500 })),
    );
    const error = await getMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
  });
});

describe('describeError', () => {
  it('returns the unavailable message only for ServerUnavailableError', () => {
    expect(describeError(new ServerUnavailableError(), 'fallback')).toBe(SERVER_UNAVAILABLE_MESSAGE);
    expect(describeError(new Error('boom'), 'fallback')).toBe('fallback');
    expect(describeError('weird', 'fallback')).toBe('fallback');
  });
});

describe('submitReviews', () => {
  it('posts { reviews } to the reviews endpoint and returns the results', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [{ clientReviewId: 'a', status: 'applied' }] }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const item = {
      cardId: 1,
      rating: 'good' as const,
      direction: 'spanish-to-english' as const,
      verdict: 'correct' as const,
      submittedText: 'cat',
      matchedText: 'cat',
      clientReviewId: 'a',
      reviewedAt: '2026-01-01T00:00:00.000Z',
    };
    const results = await submitReviews([item]);

    expect(results).toEqual([{ clientReviewId: 'a', status: 'applied' }]);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/training/reviews');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reviews: [item] });
  });
});
