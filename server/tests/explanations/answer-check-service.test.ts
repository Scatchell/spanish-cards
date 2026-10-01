import { describe, expect, it, vi } from 'vitest';
import type { AnswerCheck, NewAnswerCheck } from '../../src/explanations/answer-check-repository.js';
import { getOrCreateAnswerCheck } from '../../src/explanations/answer-check-service.js';
import { EXPLANATION_MODEL } from '../../src/explanations/llm.js';
import { PROMPT_VERSION } from '../../src/prompt-version.js';

const FAKE_CHECK: AnswerCheck = {
  id: 1,
  spanishText: 'me llamo',
  englishText: 'my name is',
  direction: 'english-to-spanish',
  submittedNormalized: 'me llamo',
  verdict: 'valid',
  suggestedAnswer: 'me llamo',
  feedbackPoints: ['valid alternative'], submittedReading: null,
  model: EXPLANATION_MODEL,
  promptVersion: PROMPT_VERSION,
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
        upsertAnswerCheck: vi.fn(),
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
        upsertAnswerCheck: async (input) => {
          inserted.push(input);
          return { ...FAKE_CHECK, ...input };
        },
        generate: async () => ({
          verdict: 'valid',
          suggestedAnswer: 'me llamo',
          feedbackPoints: ['valid alternative'], submittedReading: null,
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

  it('looks up by content key only and stamps the upserted row with PROMPT_VERSION', async () => {
    const findAnswerCheck = vi.fn().mockResolvedValue(null);
    const upserted: NewAnswerCheck[] = [];
    await getOrCreateAnswerCheck(
      {
        findAnswerCheck,
        upsertAnswerCheck: async (input) => {
          upserted.push(input);
          return { ...FAKE_CHECK, ...input };
        },
        generate: async () => ({
          verdict: 'valid',
          suggestedAnswer: 'me llamo',
          feedbackPoints: ['valid alternative'], submittedReading: null,
        }),
      },
      INPUT,
    );
    expect(findAnswerCheck).toHaveBeenCalledWith({
      spanishText: 'me llamo',
      englishText: 'my name is',
      direction: 'english-to-spanish',
      submittedNormalized: 'me llamo',
    });
    expect(upserted[0]?.promptVersion).toBe(PROMPT_VERSION);
  });

  it('returns unavailable when generate is null', async () => {
    const result = await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => null,
        upsertAnswerCheck: vi.fn(),
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
          upsertAnswerCheck: vi.fn(),
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
      feedbackPoints: ['wrong'], submittedReading: null,
    });
    await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => null,
        upsertAnswerCheck: async (input) => ({ ...FAKE_CHECK, ...input }),
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
      feedbackPoints: ['wrong'], submittedReading: null,
    });
    await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => null,
        upsertAnswerCheck: async (input) => ({ ...FAKE_CHECK, ...input }),
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

  it('regenerates and overwrites a row cached under an older prompt version', async () => {
    const stale = { ...FAKE_CHECK, promptVersion: '0.9.0', verdict: 'invalid' as const, suggestedAnswer: null };
    const upserted: NewAnswerCheck[] = [];
    const result = await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => stale,
        upsertAnswerCheck: async (input) => {
          upserted.push(input);
          return { ...stale, ...input };
        },
        generate: async () => ({
          verdict: 'valid',
          suggestedAnswer: 'me llamo',
          feedbackPoints: ['fresh'],
          submittedReading: null,
        }),
      },
      INPUT,
    );
    expect(result.status === 'ok' && result.source).toBe('generated');
    expect(result.status === 'ok' && result.answerCheck.verdict).toBe('valid');
    expect(upserted[0]).toMatchObject({ model: EXPLANATION_MODEL, promptVersion: PROMPT_VERSION });
  });

  it('regenerates a row cached under a different model even if the version matches', async () => {
    const generate = vi.fn().mockResolvedValue({
      verdict: 'valid',
      suggestedAnswer: 'me llamo',
      feedbackPoints: ['fresh'],
      submittedReading: null,
    });
    await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => ({ ...FAKE_CHECK, model: 'retired-model' }),
        upsertAnswerCheck: async (input) => ({ ...FAKE_CHECK, ...input }),
        generate,
      },
      INPUT,
    );
    expect(generate).toHaveBeenCalledOnce();
  });

  it('returns unavailable instead of serving a stale row when generation is not configured', async () => {
    const result = await getOrCreateAnswerCheck(
      {
        findAnswerCheck: async () => ({ ...FAKE_CHECK, promptVersion: '0.9.0' }),
        upsertAnswerCheck: vi.fn(),
        generate: null,
      },
      INPUT,
    );
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('leaves a stale row untouched when regeneration fails', async () => {
    const upsertAnswerCheck = vi.fn();
    await expect(
      getOrCreateAnswerCheck(
        {
          findAnswerCheck: async () => ({ ...FAKE_CHECK, promptVersion: '0.9.0' }),
          upsertAnswerCheck,
          generate: async () => {
            throw new Error('API error');
          },
        },
        INPUT,
      ),
    ).rejects.toThrow('API error');
    expect(upsertAnswerCheck).not.toHaveBeenCalled();
  });
});
