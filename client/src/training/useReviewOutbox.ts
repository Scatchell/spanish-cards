import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, submitReviews } from '../api.js';
import type { ReviewSubmission } from '../api.js';
import {
  createPendingReview,
  isOutboxFull,
  loadOutbox,
  outboxKey,
  removeById,
  saveOutbox,
  settledIds,
} from './outbox.js';
import type { KeyValueStorage, PendingReview } from './outbox.js';

export const INITIAL_RETRY_MS = 2_000;
export const MAX_RETRY_MS = 60_000;
// Reviews per request. Keeps each body small and a poisoned chunk contained.
export const FLUSH_CHUNK_SIZE = 25;

// A 4xx other than auth/timeout/rate-limit will never succeed on retry.
function isPermanentRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

export interface ReviewOutbox {
  pendingCount: number;
  isFull: boolean;
  // Queues a review for background sync. Returns false (storing nothing) when full.
  enqueue: (submission: ReviewSubmission) => boolean;
  // Resolves true once nothing is pending, false if reviews remain unsynced.
  flush: () => Promise<boolean>;
}

export function useReviewOutbox(
  userKey: string,
  onLoggedOut: () => void,
  storage: KeyValueStorage = window.localStorage,
): ReviewOutbox {
  const key = outboxKey(userKey);
  const [pending, setPending] = useState<PendingReview[]>(() => loadOutbox(storage, key));
  // The ref is the source of truth for flush/enqueue (they run outside render);
  // state mirrors it so the UI re-renders.
  const pendingRef = useRef(pending);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const retryDelay = useRef(INITIAL_RETRY_MS);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const onLoggedOutRef = useRef(onLoggedOut);

  useEffect(() => {
    onLoggedOutRef.current = onLoggedOut;
  });

  const commit = useCallback(
    (next: PendingReview[]) => {
      pendingRef.current = next;
      setPending(next);
      saveOutbox(storage, key, next);
    },
    [storage, key],
  );

  const scheduleRetry = useCallback(() => {
    if (retryTimer.current !== null) return;
    const delay = retryDelay.current;
    retryDelay.current = Math.min(delay * 2, MAX_RETRY_MS);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  const flush = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      while (pendingRef.current.length > 0) {
        const chunk = pendingRef.current.slice(0, FLUSH_CHUNK_SIZE);
        try {
          const results = await submitReviews(chunk);
          const before = pendingRef.current.length;
          commit(removeById(pendingRef.current, settledIds(results)));
          if (pendingRef.current.length === before) {
            // 200 but nothing settled: back off rather than resend in a tight loop.
            scheduleRetry();
            return false;
          }
          retryDelay.current = INITIAL_RETRY_MS;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            onLoggedOutRef.current();
            return false;
          }
          if (err instanceof ApiError && isPermanentRejection(err.status)) {
            console.error('Dropping reviews the server rejected:', err);
            commit(removeById(pendingRef.current, new Set(chunk.map((r) => r.clientReviewId))));
            continue;
          }
          scheduleRetry();
          return false;
        }
      }
      return true;
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = run;
    return run;
  }, [commit, scheduleRetry]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (pendingRef.current.length > 0) {
      void flush();
    }
    function onOnline() {
      retryDelay.current = INITIAL_RETRY_MS;
      if (retryTimer.current !== null) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      void flush();
    }
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (retryTimer.current !== null) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [flush]);

  const enqueue = useCallback(
    (submission: ReviewSubmission): boolean => {
      if (isOutboxFull(pendingRef.current)) return false;
      commit([...pendingRef.current, createPendingReview(submission, new Date())]);
      void flush();
      return true;
    },
    [commit, flush],
  );

  return { pendingCount: pending.length, isFull: isOutboxFull(pending), enqueue, flush };
}
