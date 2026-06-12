import { describe, expect, it, vi } from 'vitest';
import type { Explanation, NewExplanation } from '../../src/explanations/repository.js';
import { getOrCreateExplanation } from '../../src/explanations/service.js';

const FAKE_EXPLANATION: Explanation = {
  id: 1,
  spanishText: 'me llamo',
  englishText: 'my name is',
  contentMarkdown: '- **me llamo** = "I call myself"',
  model: 'gpt-5.4-mini',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('getOrCreateExplanation', () => {
  it('returns cached result without calling generate', async () => {
    const generate = vi.fn();
    const result = await getOrCreateExplanation(
      {
        findExplanation: async () => FAKE_EXPLANATION,
        insertExplanation: vi.fn(),
        generate,
      },
      'me llamo',
      'my name is',
    );
    expect(result).toEqual({ status: 'ok', explanation: FAKE_EXPLANATION, source: 'cached' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates, inserts, and returns generated result on cache miss', async () => {
    const inserted: NewExplanation[] = [];
    const result = await getOrCreateExplanation(
      {
        findExplanation: async () => null,
        insertExplanation: async (input) => {
          inserted.push(input);
          return { ...FAKE_EXPLANATION, ...input };
        },
        generate: async () => '- stubbed',
      },
      'me llamo',
      'my name is',
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.source).toBe('generated');
      expect(result.explanation.contentMarkdown).toBe('- stubbed');
    }
    expect(inserted).toHaveLength(1);
  });

  it('returns unavailable when generate is null', async () => {
    const result = await getOrCreateExplanation(
      {
        findExplanation: async () => null,
        insertExplanation: vi.fn(),
        generate: null,
      },
      'me llamo',
      'my name is',
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('propagates generator rejection', async () => {
    await expect(
      getOrCreateExplanation(
        {
          findExplanation: async () => null,
          insertExplanation: vi.fn(),
          generate: async () => {
            throw new Error('API error');
          },
        },
        'me llamo',
        'my name is',
      ),
    ).rejects.toThrow('API error');
  });
});
