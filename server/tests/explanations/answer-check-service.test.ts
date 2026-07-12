import { describe, expect, it, vi } from 'vitest';
import type { AnswerCheck, NewAnswerCheck } from '../../src/explanations/answer-check-repository.js';
import { getOrCreateAnswerCheck } from '../../src/explanations/answer-check-service.js';

const FAKE_CHECK: AnswerCheck = {
  id: 1,
  spanishText: 'me llamo',
  englishText: 'my name is',
  direction: 'english-to-spanish',
  submittedNormalized: 'me llamo',
  verdict: 'valid',
  suggestedAnswer: 'me llamo',
  critiqueMarkdown: '- valid alternative',
  model: 'gpt-5.4-mini',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const INPUT = {
  spanishText: 'me llamo',
  englishText: 'my name is',
  direction: 'english-to-spanish' as const,
  submittedAnswer: 'me llamo',
};

describe('getOrCreateAnswerCheck', () => {
  it('returns cached result without calling generate', async () => {
    const generate = vi.fn();
    const result = await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => FAKE_CHECK,
        insertAnswerCheck: vi.fn(),
        generate,
      },
      INPUT,
    );
    expect(result).toEqual({ status: 'ok', answerCheck: FAKE_CHECK, source: 'cached' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates, inserts, and returns generated result on cache miss', async () => {
    const inserted: NewAnswerCheck[] = [];
    const result = await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => null,
        insertAnswerCheck: async (input) => {
          inserted.push(input);
          return { ...FAKE_CHECK, ...input };
        },
        generate: async () => ({
          verdict: 'valid',
          suggestedAnswer: 'me llamo',
          critiqueMarkdown: '- valid alternative',
        }),
      },
      INPUT,
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.source).toBe('generated');
      expect(result.answerCheck.verdict).toBe('valid');
    }
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.submittedNormalized).toBe('me llamo');
  });

  it('returns unavailable when generate is null', async () => {
    const result = await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => null,
        insertAnswerCheck: vi.fn(),
        generate: null,
      },
      INPUT,
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('propagates generator rejection', async () => {
    await expect(
      getOrCreateAnswerCheck(
        {
          findAnswerCheck: async () => null,
          insertAnswerCheck: vi.fn(),
          generate: async () => {
            throw new Error('API error');
          },
        },
        INPUT,
      ),
    ).rejects.toThrow('API error');
  });

  it('selects prompt/expected from direction: spanish-to-english', async () => {
    const generate = vi.fn().mockResolvedValue({
      verdict: 'invalid',
      suggestedAnswer: null,
      critiqueMarkdown: '- wrong',
    });
    await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => null,
        insertAnswerCheck: async (input) => ({ ...FAKE_CHECK, ...input }),
        generate,
      },
      { ...INPUT, direction: 'spanish-to-english', submittedAnswer: 'my name is' },
    );
    expect(generate).toHaveBeenCalledWith({
      promptText: 'me llamo',
      expectedAnswer: 'my name is',
      submittedAnswer: 'my name is',
    });
  });

  it('selects prompt/expected from direction: english-to-spanish', async () => {
    const generate = vi.fn().mockResolvedValue({
      verdict: 'invalid',
      suggestedAnswer: null,
      critiqueMarkdown: '- wrong',
    });
    await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => null,
        insertAnswerCheck: async (input) => ({ ...FAKE_CHECK, ...input }),
        generate,
      },
      { ...INPUT, direction: 'english-to-spanish', submittedAnswer: 'me llamo' },
    );
    expect(generate).toHaveBeenCalledWith({
      promptText: 'my name is',
      expectedAnswer: 'me llamo',
      submittedAnswer: 'me llamo',
    });
  });
});
