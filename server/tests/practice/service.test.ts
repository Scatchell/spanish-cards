import { describe, expect, it, vi } from 'vitest';
import type { MistakeDetail, NewPracticeSession, PracticeExample, PracticeSession } from '../../src/practice/repository.js';
import { generatePracticeSession } from '../../src/practice/service.js';

const TARGET: MistakeDetail = {
  cardId: 1,
  category: 'agreement',
  correctText: 'la casa blanca',
  submittedText: 'la casa blanco',
  direction: 'english-to-spanish',
  rationale: 'gender agreement error',
  spanishText: 'la casa blanca',
  englishText: 'the white house',
  practiceTargets: [{ expected: 'blanca', submitted: 'blanco' }],
};

const EXAMPLES: PracticeExample[] = [{ ...TARGET, correctText: 'una silla blanca', tier: 1 }];

const SESSION: PracticeSession = {
  id: 1,
  reviewCategorizationId: 5,
  model: 'gpt-5.4',
  generatedAt: '2026-09-13T00:00:00.000Z',
  examples: EXAMPLES,
  sentences: [{ spanish: 'la mesa blanca', english: 'the white table' }],
};

describe('generatePracticeSession', () => {
  it('returns unavailable without calling anything else when generate is null', async () => {
    const getMistakeContext = vi.fn();
    const result = await generatePracticeSession(
      { getMistakeContext, selectPracticeExamples: vi.fn(), generate: null, upsertPracticeSession: vi.fn() },
      5,
    );
    expect(result).toEqual({ status: 'unavailable' });
    expect(getMistakeContext).not.toHaveBeenCalled();
  });

  it('returns not_found when the mistake does not exist', async () => {
    const result = await generatePracticeSession(
      {
        getMistakeContext: async () => null,
        selectPracticeExamples: vi.fn(),
        generate: async () => [],
        upsertPracticeSession: vi.fn(),
      },
      5,
    );
    expect(result).toEqual({ status: 'not_found' });
  });

  it('selects examples, generates sentences, and upserts the session', async () => {
    const upserted: NewPracticeSession[] = [];
    const result = await generatePracticeSession(
      {
        getMistakeContext: async (id) => {
          expect(id).toBe(5);
          return TARGET;
        },
        selectPracticeExamples: async (id) => {
          expect(id).toBe(5);
          return EXAMPLES;
        },
        generate: async (input) => {
          expect(input.target).toEqual(TARGET);
          expect(input.examples).toEqual(EXAMPLES);
          return SESSION.sentences;
        },
        upsertPracticeSession: async (input) => {
          upserted.push(input);
          return SESSION;
        },
      },
      5,
    );

    expect(result).toEqual({ status: 'ok', session: SESSION });
    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toMatchObject({
      reviewCategorizationId: 5,
      model: 'gpt-5.4',
      examples: EXAMPLES,
      sentences: SESSION.sentences,
    });
  });

  it('dedupes concurrent calls for the same id onto a single generate invocation', async () => {
    const generate = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return SESSION.sentences;
    });
    const deps = {
      getMistakeContext: async () => TARGET,
      selectPracticeExamples: async () => EXAMPLES,
      generate,
      upsertPracticeSession: async () => SESSION,
    };

    const [first, second] = await Promise.all([
      generatePracticeSession(deps, 5),
      generatePracticeSession(deps, 5),
    ]);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ status: 'ok', session: SESSION });
    expect(second).toEqual({ status: 'ok', session: SESSION });

    // A later call, after the first has settled, must not be blocked by a stale entry.
    const third = await generatePracticeSession(deps, 5);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(third).toEqual({ status: 'ok', session: SESSION });
  });
});
