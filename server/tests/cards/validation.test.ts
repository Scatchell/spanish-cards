import { describe, expect, it } from 'vitest';
import { CARD_TEXT_MAX_LENGTH, normalizeCardInput, validateCardInput } from '../../src/cards/validation.js';

describe('validateCardInput', () => {
  it('accepts a valid card', () => {
    expect(validateCardInput({ spanishText: 'hola', englishText: 'hello' })).toEqual([]);
  });

  it('requires both fields to be non-empty after trimming', () => {
    const errors = validateCardInput({ spanishText: '   ', englishText: '' });
    expect(errors).toEqual([
      { field: 'spanishText', message: 'Spanish text is required' },
      { field: 'englishText', message: 'English text is required' },
    ]);
  });

  it('rejects fields longer than the maximum', () => {
    const tooLong = 'a'.repeat(CARD_TEXT_MAX_LENGTH + 1);
    const errors = validateCardInput({ spanishText: tooLong, englishText: 'ok' });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe('spanishText');
    expect(errors[0]?.message).toContain('70');
  });

  it('accepts fields exactly at the maximum length', () => {
    const atMax = 'a'.repeat(CARD_TEXT_MAX_LENGTH);
    expect(validateCardInput({ spanishText: atMax, englishText: atMax })).toEqual([]);
  });

  it('ignores surrounding whitespace when checking length', () => {
    const atMax = 'a'.repeat(CARD_TEXT_MAX_LENGTH);
    expect(validateCardInput({ spanishText: `  ${atMax}  `, englishText: 'ok' })).toEqual([]);
  });

  it('rejects multi-line input', () => {
    const errors = validateCardInput({ spanishText: 'hola\nadiós', englishText: 'ok' });
    expect(errors).toEqual([{ field: 'spanishText', message: 'Spanish text must be a single line' }]);
  });
});

describe('normalizeCardInput', () => {
  it('trims both fields', () => {
    expect(normalizeCardInput({ spanishText: ' hola ', englishText: ' hello ' })).toEqual({
      spanishText: 'hola',
      englishText: 'hello',
    });
  });
});
