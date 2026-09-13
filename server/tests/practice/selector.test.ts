import { describe, expect, it } from 'vitest';
import type { MistakeDetail } from '../../src/practice/repository.js';
import { composeExamples, EXAMPLE_LIMIT } from '../../src/practice/selector.js';

function detail(overrides: Partial<MistakeDetail> & { correctText: string; submittedText: string }): MistakeDetail {
  return {
    cardId: 1,
    category: 'agreement',
    direction: 'english-to-spanish',
    rationale: 'r',
    spanishText: null,
    englishText: null,
    practiceTargets: [],
    ...overrides,
  };
}

describe('composeExamples', () => {
  it('fills from tier 1 first, then 2, then 3, then 4, tagging each with its tier', () => {
    const result = composeExamples([
      { tier: 1, candidates: [detail({ correctText: 'a', submittedText: 'a-sub' })] },
      { tier: 2, candidates: [detail({ correctText: 'b', submittedText: 'b-sub' })] },
      { tier: 3, candidates: [detail({ correctText: 'c', submittedText: 'c-sub' })] },
      { tier: 4, candidates: [detail({ correctText: 'd', submittedText: 'd-sub' })] },
    ]);

    expect(result.map((r) => r.tier)).toEqual([1, 2, 3, 4]);
    expect(result.map((r) => r.correctText)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('stops once the limit is reached without touching later tiers', () => {
    const result = composeExamples(
      [
        { tier: 1, candidates: [detail({ correctText: 'a', submittedText: 'a-sub' }), detail({ correctText: 'b', submittedText: 'b-sub' })] },
        { tier: 4, candidates: [detail({ correctText: 'z', submittedText: 'z-sub' })] },
      ],
      1,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.correctText).toBe('a');
  });

  it('deduplicates identical normalized correct/submitted pairs across and within tiers', () => {
    const result = composeExamples([
      {
        tier: 1,
        candidates: [
          detail({ correctText: 'La Casa Blanca', submittedText: 'la casa blanco' }),
          detail({ correctText: '  la casa blanca  ', submittedText: 'LA CASA BLANCO' }),
        ],
      },
      { tier: 2, candidates: [detail({ correctText: 'la casa blanca', submittedText: 'la casa blanco' })] },
      { tier: 3, candidates: [detail({ correctText: 'la casa blanca', submittedText: 'la casa blanca!' })] },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.tier).toBe(1);
    expect(result[1]?.tier).toBe(3);
  });

  it('returns an empty array when every tier is empty', () => {
    expect(composeExamples([])).toEqual([]);
  });

  it('defaults to EXAMPLE_LIMIT (10) when no explicit limit is passed', () => {
    const candidates = Array.from({ length: 15 }, (_, i) =>
      detail({ correctText: `c${i}`, submittedText: `s${i}` }),
    );
    const result = composeExamples([{ tier: 4, candidates }]);
    expect(result).toHaveLength(EXAMPLE_LIMIT);
  });
});
