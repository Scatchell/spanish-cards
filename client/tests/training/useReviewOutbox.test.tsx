// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ServerUnavailableError } from '../../src/api.js';
import { MAX_PENDING_REVIEWS, loadOutbox, outboxKey } from '../../src/training/outbox.js';
import type { KeyValueStorage, PendingReview } from '../../src/training/outbox.js';
import { FLUSH_CHUNK_SIZE, useReviewOutbox } from '../../src/training/useReviewOutbox.js';

const { submitReviews } = vi.hoisted(() => ({ submitReviews: vi.fn() }));
vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/api.js')>('../../src/api.js');
  return { ...actual, submitReviews };
});

const USER = 'a@x.com';
const KEY = outboxKey(USER);
const SUBMISSION = {
  cardId: 1,
  rating: 'good' as const,
  direction: 'spanish-to-english' as const,
  verdict: 'correct' as const,
  submittedText: 'cat',
  matchedText: 'cat',
};

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function settleAll(reviews: PendingReview[]) {
  return reviews.map((r) => ({ clientReviewId: r.clientReviewId, status: 'applied' as const }));
}

function seed(storage: KeyValueStorage, count: number) {
  const reviews: PendingReview[] = Array.from({ length: count }, (_, i) => ({
    ...SUBMISSION,
    cardId: i + 1,
    clientReviewId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    reviewedAt: '2026-01-01T00:00:00.000Z',
  }));
  storage.setItem(KEY, JSON.stringify(reviews));
}

beforeEach(() => {
  vi.useFakeTimers();
  submitReviews.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useReviewOutbox', () => {
  it('enqueue syncs the review, clears it, and persists the empty outbox', async () => {
    const storage = memoryStorage();
    submitReviews.mockImplementation(async (reviews: PendingReview[]) => settleAll(reviews));
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));

    await act(async () => {
      result.current.enqueue(SUBMISSION);
    });

    expect(submitReviews).toHaveBeenCalledOnce();
    expect(submitReviews.mock.calls[0]![0]).toHaveLength(1);
    expect(result.current.pendingCount).toBe(0);
    expect(loadOutbox(storage, KEY)).toEqual([]);
  });

  it('keeps reviews while offline and retries with doubling backoff until it succeeds', async () => {
    const storage = memoryStorage();
    submitReviews.mockRejectedValue(new ServerUnavailableError());
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));

    await act(async () => {
      result.current.enqueue(SUBMISSION);
    });
    expect(submitReviews).toHaveBeenCalledTimes(1);
    expect(result.current.pendingCount).toBe(1);
    expect(loadOutbox(storage, KEY)).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(submitReviews).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(submitReviews).toHaveBeenCalledTimes(2);

    // next wait is 4s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_999);
    });
    expect(submitReviews).toHaveBeenCalledTimes(2);
    submitReviews.mockImplementation(async (reviews: PendingReview[]) => settleAll(reviews));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(submitReviews).toHaveBeenCalledTimes(3);
    expect(result.current.pendingCount).toBe(0);
  });

  it('flushes immediately when the browser comes back online', async () => {
    const storage = memoryStorage();
    submitReviews.mockRejectedValueOnce(new ServerUnavailableError());
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));
    await act(async () => {
      result.current.enqueue(SUBMISSION);
    });

    submitReviews.mockImplementation(async (reviews: PendingReview[]) => settleAll(reviews));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(submitReviews).toHaveBeenCalledTimes(2);
    expect(result.current.pendingCount).toBe(0);
  });

  it('flushes reviews left in storage by a previous page load', async () => {
    const storage = memoryStorage();
    seed(storage, 3);
    submitReviews.mockImplementation(async (reviews: PendingReview[]) => settleAll(reviews));

    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));
    expect(result.current.pendingCount).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(submitReviews).toHaveBeenCalledOnce();
    expect(result.current.pendingCount).toBe(0);
  });

  it('on 401 keeps the reviews, signs out, and does not retry', async () => {
    const storage = memoryStorage();
    const onLoggedOut = vi.fn();
    submitReviews.mockRejectedValue(new ApiError(401, 'Not logged in'));
    const { result } = renderHook(() => useReviewOutbox(USER, onLoggedOut, storage));

    await act(async () => {
      result.current.enqueue(SUBMISSION);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(onLoggedOut).toHaveBeenCalledOnce();
    expect(submitReviews).toHaveBeenCalledTimes(1);
    expect(loadOutbox(storage, KEY)).toHaveLength(1);
  });

  it('drops a chunk the server permanently rejects instead of retrying forever', async () => {
    const storage = memoryStorage();
    seed(storage, 2);
    submitReviews.mockRejectedValue(new ApiError(400, 'bad body'));
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(submitReviews).toHaveBeenCalledOnce();
    expect(result.current.pendingCount).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it('treats 429 and 5xx as transient (keeps and retries)', async () => {
    const storage = memoryStorage();
    seed(storage, 1);
    submitReviews.mockRejectedValueOnce(new ApiError(429, 'slow down'));
    submitReviews.mockImplementation(async (reviews: PendingReview[]) => settleAll(reviews));
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pendingCount).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.pendingCount).toBe(0);
  });

  it('does not spin when a 200 response settles nothing', async () => {
    const storage = memoryStorage();
    seed(storage, 1);
    submitReviews.mockResolvedValue([]);
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(submitReviews).toHaveBeenCalledTimes(1);
    expect(result.current.pendingCount).toBe(1);
  });

  it('refuses to enqueue when full and reports isFull', async () => {
    const storage = memoryStorage();
    seed(storage, MAX_PENDING_REVIEWS);
    submitReviews.mockRejectedValue(new ServerUnavailableError());
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isFull).toBe(true);
    let accepted = true;
    act(() => {
      accepted = result.current.enqueue(SUBMISSION);
    });
    expect(accepted).toBe(false);
    expect(result.current.pendingCount).toBe(MAX_PENDING_REVIEWS);
  });

  it('sends a large backlog in chunks and shares one in-flight flush', async () => {
    const storage = memoryStorage();
    seed(storage, FLUSH_CHUNK_SIZE + 5);
    submitReviews.mockImplementation(async (reviews: PendingReview[]) => settleAll(reviews));
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));

    let outcomes: boolean[] = [];
    await act(async () => {
      outcomes = await Promise.all([result.current.flush(), result.current.flush()]);
    });

    expect(outcomes).toEqual([true, true]);
    expect(submitReviews.mock.calls.map((c) => (c[0] as PendingReview[]).length)).toEqual([
      FLUSH_CHUNK_SIZE,
      5,
    ]);
  });

  it('flush resolves false while still offline', async () => {
    const storage = memoryStorage();
    seed(storage, 1);
    submitReviews.mockRejectedValue(new ServerUnavailableError());
    const { result } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));
    let drained = true;
    await act(async () => {
      drained = await result.current.flush();
    });
    expect(drained).toBe(false);
  });

  it('keeps a stable flush identity across renders', () => {
    const storage = memoryStorage();
    const { result, rerender } = renderHook(() => useReviewOutbox(USER, vi.fn(), storage));
    const first = result.current.flush;
    rerender();
    expect(result.current.flush).toBe(first);
  });
});
