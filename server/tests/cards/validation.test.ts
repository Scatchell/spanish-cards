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

describe('validateCardInput alternates', () => {
  it('accepts distinct alternates', () => {
    expect(
      validateCardInput({ spanishText: 'Estoy cansado', englishText: 'I am tired', englishAlternates: ["I'm tired"] }),
    ).toEqual([]);
  });

  it('rejects a blank or too-long alternate', () => {
    const errors = validateCardInput({
      spanishText: 'hola',
      englishText: 'hello',
      spanishAlternates: ['  ', 'a'.repeat(CARD_TEXT_MAX_LENGTH + 1)],
    });
    expect(errors.map((error) => error.field)).toEqual(['spanishAlternates', 'spanishAlternates']);
    expect(errors[0]?.message).toContain('Spanish alternate 1');
    expect(errors[1]?.message).toContain('Spanish alternate 2');
  });

  it('rejects alternates that only differ from the main answer or each other by case, accents or punctuation', () => {
    const errors = validateCardInput({
      spanishText: '¿Cómo estás?',
      englishText: 'How are you?',
      spanishAlternates: ['como estas', '¿Qué tal?', 'que tal'],
    });
    expect(errors.map((error) => error.message)).toEqual([
      expect.stringContaining('Spanish alternate 1 duplicates'),
      expect.stringContaining('Spanish alternate 3 duplicates'),
    ]);
  });
});

describe('normalizeCardInput', () => {
  it('trims both fields', () => {
    expect(normalizeCardInput({ spanishText: ' hola ', englishText: ' hello ' })).toMatchObject({
      spanishText: 'hola',
      englishText: 'hello',
    });
  });

  it('fixes spacing slips around punctuation without changing words', () => {
    expect(normalizeCardInput({ spanishText: 'Hola,me llamo  David !', englishText: 'Hi,my name is David' })).toMatchObject({
      spanishText: 'Hola, me llamo David!',
      englishText: 'Hi, my name is David',
    });
  });

  it('tidies alternates and defaults missing ones to empty', () => {
    expect(
      normalizeCardInput({ spanishText: 'hola', englishText: 'hi', englishAlternates: [' hello ', 'hey,there'] }),
    ).toEqual({ spanishText: 'hola', englishText: 'hi', spanishAlternates: [], englishAlternates: ['hello', 'hey, there'] });
  });
});
