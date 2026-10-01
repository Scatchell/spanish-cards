import { describe, expect, it, vi } from 'vitest';
import type { Explanation, NewExplanation } from '../../src/explanations/repository.js';
import { getOrCreateExplanation } from '../../src/explanations/service.js';
import { EXPLANATION_MODEL } from '../../src/explanations/llm.js';
import { PROMPT_VERSION } from '../../src/prompt-version.js';

const FAKE_EXPLANATION: Explanation = {
  id: 1,
  spanishText: 'me llamo',
  englishText: 'my name is',
  contentMarkdown: '- **me llamo** = "I call myself"',
  model: EXPLANATION_MODEL,
  promptVersion: PROMPT_VERSION,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('getOrCreateExplanation', () => {
  it('returns cached result without calling generate', async () => {
    const generate = vi.fn();
    const result = await getOrCreateExplanation(
      {
        findExplanation: async () => FAKE_EXPLANATION,
        upsertExplanation: vi.fn(),
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
        upsertExplanation: async (input) => {
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
    expect(inserted[0]?.promptVersion).toBe(PROMPT_VERSION);
  });

  it('returns unavailable when generate is null', async () => {
    const result = await getOrCreateExplanation(
      {
        findExplanation: async () => null,
        upsertExplanation: vi.fn(),
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
          upsertExplanation: vi.fn(),
          generate: async () => {
            throw new Error('API error');
          },
        },
        'me llamo',
        'my name is',
      ),
    ).rejects.toThrow('API error');
  });

  it('regenerates and overwrites a row cached under an older prompt version', async () => {
    const stale = { ...FAKE_EXPLANATION, promptVersion: '0.9.0', contentMarkdown: '- old' };
    const upserted: NewExplanation[] = [];
    const result = await getOrCreateExplanation(
      {
        findExplanation: async () => stale,
        upsertExplanation: async (input) => {
          upserted.push(input);
          return { ...stale, ...input };
        },
        generate: async () => '- fresh',
      },
      'me llamo',
      'my name is',
    );
    expect(result.status === 'ok' && result.source).toBe('generated');
    expect(result.status === 'ok' && result.explanation.contentMarkdown).toBe('- fresh');
    expect(upserted).toEqual([
      {
        spanishText: 'me llamo',
        englishText: 'my name is',
        contentMarkdown: '- fresh',
        model: EXPLANATION_MODEL,
        promptVersion: PROMPT_VERSION,
      },
    ]);
  });

  it('regenerates a row cached under a different model even if the version matches', async () => {
    const generate = vi.fn().mockResolvedValue('- fresh');
    await getOrCreateExplanation(
      {
        findExplanation: async () => ({ ...FAKE_EXPLANATION, model: 'retired-model' }),
        upsertExplanation: async (input) => ({ ...FAKE_EXPLANATION, ...input }),
        generate,
      },
      'me llamo',
      'my name is',
    );
    expect(generate).toHaveBeenCalledOnce();
  });

  it('returns unavailable instead of serving a stale row when generation is not configured', async () => {
    const result = await getOrCreateExplanation(
      {
        findExplanation: async () => ({ ...FAKE_EXPLANATION, promptVersion: '0.9.0' }),
        upsertExplanation: vi.fn(),
        generate: null,
      },
      'me llamo',
      'my name is',
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('leaves a stale row untouched when regeneration fails', async () => {
    const upsertExplanation = vi.fn();
    await expect(
      getOrCreateExplanation(
        {
          findExplanation: async () => ({ ...FAKE_EXPLANATION, promptVersion: '0.9.0' }),
          upsertExplanation,
          generate: async () => {
            throw new Error('API error');
          },
        },
        'me llamo',
        'my name is',
      ),
    ).rejects.toThrow('API error');
    expect(upsertExplanation).not.toHaveBeenCalled();
  });
});
