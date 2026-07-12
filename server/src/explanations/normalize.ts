// Mirrors the client-side `normalizeAnswer`
// (client/src/training/answer-check.ts): lowercased, diacritics stripped,
// punctuation removed, whitespace collapsed. Kept intentionally simple — exact
// parity with the client checker isn't required, since this only affects the
// cache dedup rate for the answer-check table, never correctness.
export function normalizeSubmitted(text: string): string {
  const words: string[] = [];
  for (const rawWord of text.split(/\s+/)) {
    const word = [...rawWord]
      .map((ch) => {
        const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        return /^[\p{L}\p{N}]+$/u.test(base) ? base : '';
      })
      .join('');
    if (word !== '') {
      words.push(word);
    }
  }
  return words.join(' ');
}
