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
    switch (row.state) {
      case null:
      case State.New:
        deck.new += row.count;
        break;
      case State.Learning:
        deck.learning += row.count;
        break;
      case State.Relearning:
        deck.lapsed += row.count;
        break;
      case State.Review:
        if (row.durable) {
          deck.mastered += row.count;
        } else {
          deck.familiar += row.count;
        }
        break;
      default:
        deck.learning += row.count;
    }
  }
  return deck;
}
