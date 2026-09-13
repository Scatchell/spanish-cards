import { describe, expect, it } from 'vitest';
import { stripDiacritics } from '../../src/text/diacritics.js';

describe('stripDiacritics', () => {
  it('removes acute, tilde, and dieresis accents', () => {
    expect(stripDiacritics('José tomó café')).toBe('Jose tomo cafe');
    expect(stripDiacritics('mañana')).toBe('manana');
    expect(stripDiacritics('pingüino')).toBe('pinguino');
  });

  it('leaves unaccented text untouched', () => {
    expect(stripDiacritics('hello world')).toBe('hello world');
  });

  it('preserves case', () => {
    expect(stripDiacritics('ÁÉÍÓÚ')).toBe('AEIOU');
  });
});
