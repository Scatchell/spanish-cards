import { normalizeSubmitted } from '../explanations/normalize.js';
import { tidySpacing } from '../text/spacing.js';

export const CARD_TEXT_MAX_LENGTH = 70;

export interface CardInput {
  spanishText: string;
  englishText: string;
  spanishAlternates?: string[];
  englishAlternates?: string[];
}

export type CardField = 'spanishText' | 'englishText';

export type CardAlternatesField = 'spanishAlternates' | 'englishAlternates';

export interface CardValidationError {
  field: CardField | CardAlternatesField;
  message: string;
}

export function normalizeCardInput(input: CardInput): CardInput {
  return {
    spanishText: tidySpacing(input.spanishText),
    englishText: tidySpacing(input.englishText),
    spanishAlternates: (input.spanishAlternates ?? []).map(tidySpacing),
    englishAlternates: (input.englishAlternates ?? []).map(tidySpacing),
  };
}

export function validateCardInput(input: CardInput): CardValidationError[] {
  return [
    ...validateField('spanishText', 'Spanish', input.spanishText),
    ...validateField('englishText', 'English', input.englishText),
    ...validateAlternates('spanishAlternates', 'Spanish', input.spanishText, input.spanishAlternates ?? []),
    ...validateAlternates('englishAlternates', 'English', input.englishText, input.englishAlternates ?? []),
  ];
}

function validateField(field: CardField, label: string, raw: string): CardValidationError[] {
  const message = textProblem(label, raw);
  return message ? [{ field, message }] : [];
}

function validateAlternates(
  field: CardAlternatesField,
  label: string,
  primary: string,
  alternates: string[],
): CardValidationError[] {
  const errors: CardValidationError[] = [];
  const seen = new Set([normalizeSubmitted(primary)]);
  alternates.forEach((raw, i) => {
    const altLabel = `${label} alternate ${i + 1}`;
    const problem = textProblem(altLabel, raw);
    if (problem) {
      errors.push({ field, message: problem });
      return;
    }
    const normalized = normalizeSubmitted(raw);
    if (seen.has(normalized)) {
      errors.push({
        field,
        message: `${altLabel} duplicates the main answer or another alternate (matching already ignores case, accents and punctuation)`,
      });
      return;
    }
    seen.add(normalized);
  });
  return errors;
}

function textProblem(label: string, raw: string): string | null {
  const value = tidySpacing(raw);
  if (value.length === 0) {
    return `${label} text is required`;
  }
  if (/[\r\n]/.test(raw)) {
    return `${label} text must be a single line`;
  }
  if (value.length > CARD_TEXT_MAX_LENGTH) {
    return `${label} text must be ${CARD_TEXT_MAX_LENGTH} characters or fewer`;
  }
  return null;
}
