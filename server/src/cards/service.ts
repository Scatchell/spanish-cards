import type { Card } from './repository.js';
import type { CardInput, CardValidationError } from './validation.js';
import { normalizeCardInput, validateCardInput } from './validation.js';

export interface BatchFailure {
  index: number;
  errors: CardValidationError[];
}

export interface BatchSaveResult {
  saved: Card[];
  failures: BatchFailure[];
}

export type InsertCards = (inputs: CardInput[]) => Promise<Card[]>;

export type UpdateCard = (id: number, input: CardInput) => Promise<Card | null>;

export type UpdateCardTextResult =
  | { ok: true; card: Card }
  | { ok: false; errors: CardValidationError[] }
  | { ok: false; notFound: true };

// Validates then persists a single card's text. Mirrors saveCardBatch's
// validate-then-persist shape but for one card; never touches schedule state.
export async function updateCardText(
  id: number,
  input: CardInput,
  updateCard: UpdateCard,
): Promise<UpdateCardTextResult> {
  const errors = validateCardInput(input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const card = await updateCard(id, normalizeCardInput(input));
  if (!card) {
    return { ok: false, notFound: true };
  }
  return { ok: true, card };
}

// Saves every valid card in the batch and reports validation failures by
// their position in the submitted array, so the caller can keep invalid
// drafts on screen while the rest are persisted.
export async function saveCardBatch(
  inputs: CardInput[],
  insertCards: InsertCards,
): Promise<BatchSaveResult> {
  const valid: CardInput[] = [];
  const failures: BatchFailure[] = [];

  inputs.forEach((input, index) => {
    const errors = validateCardInput(input);
    if (errors.length > 0) {
      failures.push({ index, errors });
    } else {
      valid.push(normalizeCardInput(input));
    }
  });

  const saved = await insertCards(valid);
  return { saved, failures };
}
