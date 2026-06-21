import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/cards/repository.js';
import { saveCardBatch, updateCardText } from '../../src/cards/service.js';
import type { CardInput } from '../../src/cards/validation.js';

function fakeCard(id: number, input: CardInput): Card {
  return {
    id,
    spanishText: input.spanishText,
    englishText: input.englishText,
    languagePair: 'en<->es',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    due: '2026-01-01T00:00:00.000Z',
    reviewed: false,
  };
}

function fakeInsert(inserted: CardInput[][]) {
  return async (inputs: CardInput[]): Promise<Card[]> => {
    inserted.push(inputs);
    return inputs.map((input, i) => ({
      id: i + 1,
      spanishText: input.spanishText,
      englishText: input.englishText,
      languagePair: 'en<->es',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      due: '2026-01-01T00:00:00.000Z',
      reviewed: false,
    }));
  };
}

describe('saveCardBatch', () => {
  it('saves all cards when every card is valid', async () => {
    const inserted: CardInput[][] = [];
    const result = await saveCardBatch(
      [
        { spanishText: 'hola', englishText: 'hello' },
        { spanishText: 'adiós', englishText: 'goodbye' },
      ],
      fakeInsert(inserted),
    );
    expect(result.saved).toHaveLength(2);
    expect(result.failures).toEqual([]);
    expect(inserted[0]).toHaveLength(2);
  });

  it('saves valid cards and reports failures with their original indexes', async () => {
    const inserted: CardInput[][] = [];
    const result = await saveCardBatch(
      [
        { spanishText: 'hola', englishText: 'hello' },
        { spanishText: '', englishText: 'broken' },
        { spanishText: 'gato', englishText: 'cat' },
        { spanishText: 'perro', englishText: '' },
      ],
      fakeInsert(inserted),
    );
    expect(result.saved.map((card) => card.spanishText)).toEqual(['hola', 'gato']);
    expect(result.failures.map((failure) => failure.index)).toEqual([1, 3]);
    expect(result.failures[0]?.errors[0]?.field).toBe('spanishText');
    expect(result.failures[1]?.errors[0]?.field).toBe('englishText');
  });

  it('normalizes whitespace before inserting', async () => {
    const inserted: CardInput[][] = [];
    await saveCardBatch([{ spanishText: '  hola  ', englishText: ' hello ' }], fakeInsert(inserted));
    expect(inserted[0]).toEqual([{ spanishText: 'hola', englishText: 'hello' }]);
  });

  it('inserts nothing when every card is invalid', async () => {
    const inserted: CardInput[][] = [];
    const result = await saveCardBatch([{ spanishText: '', englishText: '' }], fakeInsert(inserted));
    expect(result.saved).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(inserted[0]).toEqual([]);
  });
});

describe('updateCardText', () => {
  it('normalizes input and persists when valid', async () => {
    const calls: CardInput[] = [];
    const result = await updateCardText(
      7,
      { spanishText: '  hola  ', englishText: ' hello ' },
      async (id, input) => {
        calls.push(input);
        return fakeCard(id, input);
      },
    );
    expect(result).toEqual({ ok: true, card: fakeCard(7, { spanishText: 'hola', englishText: 'hello' }) });
    expect(calls).toEqual([{ spanishText: 'hola', englishText: 'hello' }]);
  });

  it('short-circuits with validation errors before calling updateCard', async () => {
    let called = false;
    const result = await updateCardText(
      7,
      { spanishText: '', englishText: 'hello' },
      async (id, input) => {
        called = true;
        return fakeCard(id, input);
      },
    );
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok && 'errors' in result) {
      expect(result.errors[0]?.field).toBe('spanishText');
    } else {
      throw new Error('expected validation errors');
    }
  });

  it('returns notFound when no row matched', async () => {
    const result = await updateCardText(
      999,
      { spanishText: 'hola', englishText: 'hello' },
      async () => null,
    );
    expect(result).toEqual({ ok: false, notFound: true });
  });
});
