import type { Card } from './repository.js';
import type { AlternateAnswer, AlternateField } from './alternates-repository.js';
import { MAX_ALTERNATES_PER_FIELD, isDuplicateAnswer, validateAlternateText } from './alternates-validation.js';

export interface AlternatesDeps {
  getCard: (id: number) => Promise<Card | null>;
  listAlternates: (cardId: number, field: AlternateField) => Promise<AlternateAnswer[]>;
  insertAlternate: (cardId: number, field: AlternateField, text: string) => Promise<AlternateAnswer>;
  getAlternate: (id: number) => Promise<AlternateAnswer | null>;
  updateAlternateText: (id: number, text: string) => Promise<AlternateAnswer | null>;
  deleteAlternate: (id: number) => Promise<boolean>;
}

export type CreateAlternateResult =
  | { ok: true; alternate: AlternateAnswer }
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 404 };

export type UpdateAlternateResult = CreateAlternateResult;

export type DeleteAlternateResult = { ok: true } | { ok: false; status: 404 };

function primaryTextFor(card: Card, field: AlternateField): string {
  return field === 'spanish' ? card.spanishText : card.englishText;
}

export async function createAlternate(
  cardId: number,
  field: AlternateField,
  rawText: string,
  deps: AlternatesDeps,
): Promise<CreateAlternateResult> {
  const card = await deps.getCard(cardId);
  if (!card) {
    return { ok: false, status: 404 };
  }
  const text = rawText.trim();
  const errors = validateAlternateText(text);
  if (errors.length > 0) {
    return { ok: false, status: 400, error: errors[0]! };
  }
  const existing = await deps.listAlternates(cardId, field);
  if (existing.length >= MAX_ALTERNATES_PER_FIELD) {
    return { ok: false, status: 400, error: `Maximum ${MAX_ALTERNATES_PER_FIELD} alternate answers reached` };
  }
  if (isDuplicateAnswer(text, [primaryTextFor(card, field), ...existing.map((a) => a.text)])) {
    return { ok: false, status: 400, error: 'This answer already exists for this card' };
  }
  const alternate = await deps.insertAlternate(cardId, field, text);
  return { ok: true, alternate };
}

export async function updateAlternate(
  cardId: number,
  altId: number,
  rawText: string,
  deps: AlternatesDeps,
): Promise<UpdateAlternateResult> {
  const existingAlt = await deps.getAlternate(altId);
  if (!existingAlt || existingAlt.cardId !== cardId) {
    return { ok: false, status: 404 };
  }
  const card = await deps.getCard(cardId);
  if (!card) {
    return { ok: false, status: 404 };
  }
  const text = rawText.trim();
  const errors = validateAlternateText(text);
  if (errors.length > 0) {
    return { ok: false, status: 400, error: errors[0]! };
  }
  const siblings = (await deps.listAlternates(cardId, existingAlt.field)).filter((a) => a.id !== altId);
  if (isDuplicateAnswer(text, [primaryTextFor(card, existingAlt.field), ...siblings.map((a) => a.text)])) {
    return { ok: false, status: 400, error: 'This answer already exists for this card' };
  }
  const alternate = await deps.updateAlternateText(altId, text);
  if (!alternate) {
    return { ok: false, status: 404 };
  }
  return { ok: true, alternate };
}

export async function deleteAlternateById(
  cardId: number,
  altId: number,
  deps: AlternatesDeps,
): Promise<DeleteAlternateResult> {
  const existingAlt = await deps.getAlternate(altId);
  if (!existingAlt || existingAlt.cardId !== cardId) {
    return { ok: false, status: 404 };
  }
  await deps.deleteAlternate(altId);
  return { ok: true };
}
