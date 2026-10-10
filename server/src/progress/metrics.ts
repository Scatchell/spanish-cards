export interface ReviewEvent {
  cardId: number;
  detectedCorrect: boolean;
  reviewedAt: Date;
}

const MAX_TZ_OFFSET_MINUTES = 14 * 60;

// Minutes ahead of UTC for the user's local time (the negation of
// JavaScript's Date#getTimezoneOffset). Invalid input falls back to UTC.
export function clampTzOffset(value: unknown): number {
  const offset = Number(value);
  if (!Number.isInteger(offset)) {
    return 0;
  }
  return Math.max(-MAX_TZ_OFFSET_MINUTES, Math.min(MAX_TZ_OFFSET_MINUTES, offset));
}
