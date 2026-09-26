// Mirrored by tidySpacing in client/src/training/answer-check.ts — keep in sync.
const SPACE_BEFORE_CLOSING_PUNCTUATION = / +([,;:!?.)…])/g;
const SPACE_AFTER_OPENING_PUNCTUATION = /([¿¡(]) +/g;
const CLOSING_PUNCTUATION_BEFORE_LETTER = /([,;:!?)…])(?=[\p{L}¿¡(])/gu;
const SENTENCE_PERIOD_BEFORE_LETTER = /(\p{Ll}{2}\.|\.{3})(?=\p{L})/gu;
const INVERTED_MARK_AFTER_TEXT = /([\p{L}\p{N}.,;:!?)…])(?=[¿¡])/gu;

export function tidySpacing(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(SPACE_BEFORE_CLOSING_PUNCTUATION, '$1')
    .replace(SPACE_AFTER_OPENING_PUNCTUATION, '$1')
    .replace(CLOSING_PUNCTUATION_BEFORE_LETTER, '$1 ')
    .replace(SENTENCE_PERIOD_BEFORE_LETTER, '$1 ')
    .replace(INVERTED_MARK_AFTER_TEXT, '$1 ')
    .trim();
}
