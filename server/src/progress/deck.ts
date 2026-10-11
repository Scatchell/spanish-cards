import { State } from 'ts-fsrs';

// FSRS stability is the number of days until recall probability falls to the
// target retention, so a card at or above this is one the user should still
// remember in three weeks.
export const MASTERED_STABILITY_DAYS = 21;

// One row per (raw FSRS state, durable?) from SQL; state is null for a card
// that has never been reviewed (no schedule row).
export interface DeckBucketRow {
  state: number | null;
  durable: boolean;
  count: number;
}

export interface DeckBreakdown {
  total: number;
  mastered: number;
  familiar: number;
  learning: number;
  lapsed: number;
  new: number;
  masteredThresholdDays: number;
}

type Bucket = 'mastered' | 'familiar' | 'learning' | 'lapsed' | 'new';

function bucketFor({ state, durable }: DeckBucketRow): Bucket {
  if (state === null || state === State.New) return 'new';
  if (state === State.Learning) return 'learning';
  if (state === State.Relearning) return 'lapsed';
  return durable ? 'mastered' : 'familiar';
}

export function computeDeckBreakdown(rows: DeckBucketRow[]): DeckBreakdown {
  const deck: DeckBreakdown = {
    total: 0,
    mastered: 0,
    familiar: 0,
    learning: 0,
    lapsed: 0,
    new: 0,
    masteredThresholdDays: MASTERED_STABILITY_DAYS,
  };
  for (const row of rows) {
    deck.total += row.count;
    deck[bucketFor(row)] += row.count;
  }
  return deck;
}
