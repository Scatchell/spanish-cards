import { describe, expect, it } from 'vitest';
import type { DiffSegment } from '../../src/training/answer-check.js';
import { checkAnswer, normalizeAnswer } from '../../src/training/answer-check.js';

function missing(segments: DiffSegment[]): string[] {
  return segments.filter((s) => s.kind === 'missing').map((s) => s.text);
}

function extra(segments: DiffSegment[]): string[] {
  return segments.filter((s) => s.kind === 'extra').map((s) => s.text);
}

function fullText(segments: DiffSegment[]): string {
  return segments.map((s) => s.text).join('');
}

describe('checkAnswer verdicts', () => {
  it('marks an exact match as correct', () => {
    const result = checkAnswer('el gato', 'el gato');
    expect(result.verdict).toBe('correct');
    expect(missing(result.correctSegments)).toEqual([]);
  });

  it('forgives missing accents but flags the difference', () => {
    const result = checkAnswer('como estas', 'cómo estás');
    expect(result.verdict).toBe('correctWithDifferences');
    expect(missing(result.correctSegments)).toEqual(['ó', 'á']);
  });

  it('forgives ñ typed as n', () => {
    expect(checkAnswer('manana', 'mañana').verdict).toBe('correctWithDifferences');
  });

  it('forgives capitalization differences without highlighting them', () => {
    const result = checkAnswer('hola', 'Hola');
    expect(result.verdict).toBe('correctWithDifferences');
    expect(missing(result.correctSegments)).toEqual([]);
  });

  it('forgives missing punctuation, including inverted Spanish punctuation', () => {
    const result = checkAnswer('como estas', '¿Cómo estás?');
    expect(result.verdict).toBe('correctWithDifferences');
    expect(missing(result.correctSegments)).toEqual(['¿', 'ó', 'á', '?']);
    expect(fullText(result.correctSegments)).toBe('¿Cómo estás?');
  });

  it('does not flag punctuation the user actually typed', () => {
    const result = checkAnswer('¿como estas?', '¿Cómo estás?');
    expect(result.verdict).toBe('correctWithDifferences');
    expect(missing(result.correctSegments)).toEqual(['ó', 'á']);
  });

  it('forgives extra and repeated spaces', () => {
    expect(checkAnswer('  buenos   días ', 'buenos días').verdict).toBe(
      'correctWithDifferences',
    );
  });

  it('requires word order to match', () => {
    expect(checkAnswer('días buenos', 'buenos días').verdict).toBe('incorrect');
  });

  it('rejects a missing word', () => {
    const result = checkAnswer('buenos', 'buenos días');
    expect(result.verdict).toBe('incorrect');
    expect(missing(result.correctSegments)).toEqual(['días']);
  });

  it('rejects a wrong word, highlights it missing in the correct answer and marks the submitted word as extra', () => {
    const result = checkAnswer('el perro', 'el gato');
    expect(result.verdict).toBe('incorrect');
    expect(missing(result.correctSegments)).toEqual(['gato']);
    expect(extra(result.correctSegments)).toEqual(['perro']);
  });

  it('rejects an empty answer', () => {
    expect(checkAnswer('', 'hola').verdict).toBe('incorrect');
    expect(checkAnswer('   ', 'hola').verdict).toBe('incorrect');
  });

  it('aligns words correctly when a word is missing at the start', () => {
    const result = checkAnswer('días', 'buenos días');
    expect(result.verdict).toBe('incorrect');
    expect(missing(result.correctSegments)).toEqual(['buenos']);
    expect(extra(result.correctSegments)).toEqual([]);
  });

  it('renders extra submitted words as extra and missing correct words as missing', () => {
    const result = checkAnswer(
      'Fuimos una pequeña de excursion, y perdimos',
      'Fuimos a hacer una pequeña excursión y nos perdimos.',
    );
    expect(result.verdict).toBe('incorrect');
    const missingTexts = missing(result.correctSegments);
    expect(missingTexts).toContain('a');
    expect(missingTexts).toContain('hacer');
    expect(missingTexts).toContain('nos');
    expect(extra(result.correctSegments)).toEqual(['de']);
    // 'ó' inside excursión should be highlighted missing
    expect(missingTexts).toContain('ó');
  });
});

describe('normalizeAnswer', () => {
  it('strips accents, case, punctuation, and extra spaces', () => {
    expect(normalizeAnswer('  ¡Buenos   DÍAS, señor!  ')).toBe('buenos dias senor');
  });
});
