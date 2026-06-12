import { describe, expect, it } from 'vitest';
import { canExplain } from '../../src/explain/canExplain.js';

describe('canExplain', () => {
  it('returns true for en<->es language pair', () => {
    expect(canExplain({ languagePair: 'en<->es' })).toBe(true);
  });

  it('returns false for other language pairs', () => {
    expect(canExplain({ languagePair: 'fr<->es' })).toBe(false);
    expect(canExplain({ languagePair: 'en<->fr' })).toBe(false);
    expect(canExplain({ languagePair: '' })).toBe(false);
  });
});
