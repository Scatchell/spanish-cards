import { describe, expect, it } from 'vitest';
import { parseAnswerCheck } from '../../src/explanations/llm.js';

function raw(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    verdict: 'invalid',
    feedbackPoints: ['Wrong tense.'],
    submittedReading: { text: 'No me da cuenta', translation: "I don't realize" },
    ...overrides,
  });
}

describe('parseAnswerCheck', () => {
  it('passes a well-formed invalid result through', () => {
    expect(parseAnswerCheck(raw())).toEqual({
      verdict: 'invalid',
      suggestedAnswer: null,
      feedbackPoints: ['Wrong tense.'],
      submittedReading: { text: 'No me da cuenta', translation: "I don't realize" },
    });
  });

  it('caps feedback at three points and drops blank ones', () => {
    const result = parseAnswerCheck(raw({ feedbackPoints: ['a', '  ', 'b', 'c', 'd'] }));
    expect(result.feedbackPoints).toEqual(['a', 'b', 'c']);
  });

  it('rejects a response with no usable feedback', () => {
    expect(() => parseAnswerCheck(raw({ feedbackPoints: ['  '] }))).toThrow(/feedback/);
  });

  it('suggests nothing for an invalid verdict', () => {
    expect(parseAnswerCheck(raw()).suggestedAnswer).toBeNull();
  });

  it("suggests the learner's own cleaned-up reading for a valid verdict", () => {
    const result = parseAnswerCheck(
      raw({
        verdict: 'valid',
        submittedReading: { text: 'Quiero hacer un omelette para cenar', translation: 'x' },
        // A stray field from the model must not override the learner's answer.
        suggestedAnswer: 'Quiero hacer una tortilla para cenar',
      }),
    );
    expect(result.suggestedAnswer).toBe('Quiero hacer un omelette para cenar');
  });

  it('suggests nothing for a valid verdict without a reading or longer than 70 characters', () => {
    expect(
      parseAnswerCheck(raw({ verdict: 'valid', submittedReading: null })).suggestedAnswer,
    ).toBeNull();
    const long = { text: 'y'.repeat(71), translation: 'x' };
    expect(
      parseAnswerCheck(raw({ verdict: 'valid', submittedReading: long })).suggestedAnswer,
    ).toBeNull();
  });

  it('treats a null or half-blank reading as no reading', () => {
    expect(parseAnswerCheck(raw({ submittedReading: null })).submittedReading).toBeNull();
    expect(
      parseAnswerCheck(raw({ submittedReading: { text: 'hola', translation: ' ' } }))
        .submittedReading,
    ).toBeNull();
  });
});
