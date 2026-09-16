import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/cards/repository.js';
import type { AlternateAnswer } from '../../src/cards/alternates-repository.js';
import {
  createAlternate,
  deleteAlternateById,
  updateAlternate,
} from '../../src/cards/alternates-service.js';
import type { AlternatesDeps } from '../../src/cards/alternates-service.js';

function fakeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 1,
    spanishText: 'coche',
    englishText: 'car',
    languagePair: 'en<->es',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    due: '2026-01-01T00:00:00.000Z',
    reviewed: false,
    spanishAlternates: [],
    englishAlternates: [],
    ...overrides,
  };
}

function fakeAlt(overrides: Partial<AlternateAnswer> = {}): AlternateAnswer {
  return { id: 1, cardId: 1, field: 'english', text: 'automobile', position: 0, ...overrides };
}

function makeDeps(overrides: Partial<AlternatesDeps> = {}): AlternatesDeps {
  return {
    getCard: async () => fakeCard(),
    listAlternates: async () => [],
    insertAlternate: async (cardId, field, text) => fakeAlt({ cardId, field, text }),
    getAlternate: async () => fakeAlt(),
    updateAlternateText: async (id, text) => fakeAlt({ id, text }),
    deleteAlternate: async () => true,
    ...overrides,
  };
}

describe('createAlternate', () => {
  it('inserts a valid, non-duplicate alternate', async () => {
    const inserted: [number, string, string][] = [];
    const deps = makeDeps({
      insertAlternate: async (cardId, field, text) => {
        inserted.push([cardId, field, text]);
        return fakeAlt({ cardId, field, text });
      },
    });
    const result = await createAlternate(1, 'english', '  automobile  ', deps);
    expect(result).toMatchObject({ ok: true, alternate: { text: 'automobile' } });
    expect(inserted).toEqual([[1, 'english', 'automobile']]);
  });

  it('404s when the card does not exist', async () => {
    const deps = makeDeps({ getCard: async () => null });
    const result = await createAlternate(999, 'english', 'car', deps);
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it('400s on blank text', async () => {
    const result = await createAlternate(1, 'english', '   ', makeDeps());
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('400s when 5 alternates already exist', async () => {
    const deps = makeDeps({
      listAlternates: async () =>
        Array.from({ length: 5 }, (_, i) => fakeAlt({ id: i + 1, text: `alt${i}`, position: i })),
    });
    const result = await createAlternate(1, 'english', 'automobile', deps);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('400s when the text duplicates the primary answer after normalization', async () => {
    const deps = makeDeps({ getCard: async () => fakeCard({ englishText: 'Car' }) });
    const result = await createAlternate(1, 'english', 'car', deps);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('400s when the text duplicates an existing alternate after normalization', async () => {
    const deps = makeDeps({ listAlternates: async () => [fakeAlt({ text: 'Automobile' })] });
    const result = await createAlternate(1, 'english', 'automobile', deps);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});

describe('updateAlternate', () => {
  it('updates when found and valid', async () => {
    const deps = makeDeps({ getAlternate: async () => fakeAlt({ cardId: 1 }) });
    const result = await updateAlternate(1, 1, 'auto', deps);
    expect(result).toMatchObject({ ok: true, alternate: { text: 'auto' } });
  });

  it('404s when the alternate does not belong to the card', async () => {
    const deps = makeDeps({ getAlternate: async () => fakeAlt({ cardId: 2 }) });
    const result = await updateAlternate(1, 1, 'auto', deps);
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it('excludes itself from the duplicate check', async () => {
    const deps = makeDeps({
      getAlternate: async () => fakeAlt({ id: 5, cardId: 1, text: 'automobile' }),
      listAlternates: async () => [fakeAlt({ id: 5, text: 'automobile' })],
    });
    const result = await updateAlternate(1, 5, 'automobile', deps);
    expect(result).toMatchObject({ ok: true });
  });
});

describe('deleteAlternateById', () => {
  it('deletes when found', async () => {
    const deps = makeDeps({ getAlternate: async () => fakeAlt({ cardId: 1 }) });
    const result = await deleteAlternateById(1, 1, deps);
    expect(result).toEqual({ ok: true });
  });

  it('404s when the alternate does not belong to the card', async () => {
    const deps = makeDeps({ getAlternate: async () => fakeAlt({ cardId: 2 }) });
    const result = await deleteAlternateById(1, 1, deps);
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it('404s when the alternate does not exist', async () => {
    const deps = makeDeps({ getAlternate: async () => null });
    const result = await deleteAlternateById(1, 1, deps);
    expect(result).toEqual({ ok: false, status: 404 });
  });
});
