import { describe, expect, it } from 'vitest';
import { normalizeSubmitted } from '../../src/explanations/normalize.js';

describe('normalizeSubmitted', () => {
  it('lowercases, strips accents, drops punctuation, collapses whitespace', () => {
    expect(normalizeSubmitted('  ¡Hola,   José!  ')).toBe('hola jose');
  });

  it('returns an empty string for punctuation-only input', () => {
    expect(normalizeSubmitted('¿¡...!?')).toBe('');
  });
});
