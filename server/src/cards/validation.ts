import { tidySpacing } from '../text/spacing.js';

export const CARD_TEXT_MAX_LENGTH = 70;

export interface CardInput {
  spanishText: string;
  englishText: string;
}

export type CardField = 'spanishText' | 'englishText';

export interface CardValidationError {
  field: CardField;
  message: string;
}

export function normalizeCardInput(input: CardInput): CardInput {
  return {
    spanishText: tidySpacing(input.spanishText),
    englishText: tidySpacing(input.englishText),
  };
}

export function validateCardInput(input: CardInput): CardValidationError[] {
  return [
    ...validateField('spanishText', 'Spanish', input.spanishText),
    ...validateField('englishText', 'English', input.englishText),
  ];
}

function validateField(field: CardField, label: string, raw: string): CardValidationError[] {
  const value = tidySpacing(raw);
  if (value.length === 0) {
    return [{ field, message: `${label} text is required` }];
  }
  if (/[\r\n]/.test(raw)) {
    return [{ field, message: `${label} text must be a single line` }];
  }
  if (value.length > CARD_TEXT_MAX_LENGTH) {
    return [{ field, message: `${label} text must be ${CARD_TEXT_MAX_LENGTH} characters or fewer` }];
  }
  return [];
}
