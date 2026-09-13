import { describe, expect, it } from 'vitest';
import { dedupKey, normalizeForDedup } from '../../src/practice/normalize.js';

describe('normalizeForDedup', () => {
  it('lowercases, strips accents, and collapses/trims whitespace', () => {
    expect(normalizeForDedup('  Está   Bién  ')).toBe('esta bien');
  });

  it('does not strip punctuation (unlike normalizeForSearch/normalizeSubmitted)', () => {
    expect(normalizeForDedup('¿Cómo estás?')).toBe('¿como estas?');
  });
});

describe('dedupKey', () => {
  it('produces the same key for case/accent/whitespace variants of the same pair', () => {
    const a = dedupKey('la casa blanca', 'la casa blanco');
    const b = dedupKey('  La Casa Blanca  ', 'LA CASA BLANCO');
    expect(a).toBe(b);
  });

  it('produces different keys for different submitted text', () => {
    const a = dedupKey('la casa blanca', 'la casa blanco');
    const b = dedupKey('la casa blanca', 'la casa blancoo');
    expect(a).not.toBe(b);
  });
});
