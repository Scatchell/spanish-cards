// Shared by cards/search.ts and explanations/normalize.ts, which each layer
// their own (different) punctuation/tokenization rules on top of this.
export function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
