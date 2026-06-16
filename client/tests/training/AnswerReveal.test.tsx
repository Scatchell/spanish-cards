// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnswerReveal } from '../../src/training/AnswerReveal.js';
import { checkAnswer } from '../../src/training/answer-check.js';

describe('AnswerReveal', () => {
  it('shows the plain correct answer text without leaking extra (user) words', () => {
    // Regression: extra segments were previously included in the bold correct-answer line
    const result = checkAnswer('el perro', 'el gato');
    render(<AnswerReveal submitted="el perro" result={result} />);
    expect(screen.getByLabelText('Correct answer').textContent).toBe('el gato');
  });

  it('shows no diff row for an exact match', () => {
    const result = checkAnswer('el gato', 'el gato');
    const { container } = render(<AnswerReveal submitted="el gato" result={result} />);
    expect(container.querySelector('.answer-diff')).toBeNull();
  });

  it('renders extra (user) words with .extra class in the diff row', () => {
    const result = checkAnswer('el perro', 'el gato');
    const { container } = render(<AnswerReveal submitted="el perro" result={result} />);
    expect(container.querySelector('.answer-diff mark.extra')?.textContent).toBe('perro');
  });

  it('renders missing correct words as plain marks in the diff row', () => {
    const result = checkAnswer('el perro', 'el gato');
    const { container } = render(<AnswerReveal submitted="el perro" result={result} />);
    expect(container.querySelector('.answer-diff mark:not(.extra)')?.textContent).toBe('gato');
  });

  it('shows the accented correct answer plainly and highlights only the differing chars', () => {
    const result = checkAnswer('como estas', '¿Cómo estás?');
    const { container } = render(<AnswerReveal submitted="como estas" result={result} />);
    expect(container.querySelector('.correct-answer')?.textContent).toBe('¿Cómo estás?');
    const marks = [...container.querySelectorAll('.answer-diff mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['ó', 'á']);
  });
});
