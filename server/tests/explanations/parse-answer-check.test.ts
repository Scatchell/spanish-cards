import { describe, expect, it } from 'vitest';
import { parseAnswerCheck } from '../../src/explanations/llm.js';

function raw(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    verdict: 'invalid',
    suggestedAnswer: null,
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

  it('keeps suggestedAnswer only for a valid verdict, trimmed to 70 characters', () => {
    expect(parseAnswerCheck(raw({ suggestedAnswer: 'x' })).suggestedAnswer).toBeNull();
    const long = 'y'.repeat(100);
    expect(
      parseAnswerCheck(raw({ verdict: 'valid', suggestedAnswer: long })).suggestedAnswer,
    ).toHaveLength(70);
  });

  it('treats a null or half-blank reading as no reading', () => {
    expect(parseAnswerCheck(raw({ submittedReading: null })).submittedReading).toBeNull();
    expect(
      parseAnswerCheck(raw({ submittedReading: { text: 'hola', translation: ' ' } }))
        .submittedReading,
    ).toBeNull();
  });
});
