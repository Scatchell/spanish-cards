// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnswerReveal } from '../../src/training/AnswerReveal.js';
import { checkAnswerWithAlternates } from '../../src/training/answer-check.js';

afterEach(cleanup);

describe('AnswerReveal', () => {
  it('shows the plain correct answer text without leaking extra (user) words', () => {
    // Regression: extra segments were previously included in the bold correct-answer line
    const result = checkAnswerWithAlternates('el perro', 'el gato', []);
    render(<AnswerReveal submitted="el perro" result={result} primaryText="el gato" />);
    expect(screen.getByLabelText('Correct answer').textContent).toBe('el gato');
  });

  it('shows no diff row for an exact match', () => {
    const result = checkAnswerWithAlternates('el gato', 'el gato', []);
    const { container } = render(
      <AnswerReveal submitted="el gato" result={result} primaryText="el gato" />,
    );
    expect(container.querySelector('.answer-diff')).toBeNull();
  });

  it('renders extra (user) words with .extra class in the diff row', () => {
    const result = checkAnswerWithAlternates('el perro', 'el gato', []);
    const { container } = render(
      <AnswerReveal submitted="el perro" result={result} primaryText="el gato" />,
    );
    expect(container.querySelector('.answer-diff mark.extra')?.textContent).toBe('perro');
  });

  it('renders missing correct words as plain marks in the diff row', () => {
    const result = checkAnswerWithAlternates('el perro', 'el gato', []);
    const { container } = render(
      <AnswerReveal submitted="el perro" result={result} primaryText="el gato" />,
    );
    expect(container.querySelector('.answer-diff mark:not(.extra)')?.textContent).toBe('gato');
  });

  it('shows the accented correct answer plainly and highlights only the differing chars', () => {
    const result = checkAnswerWithAlternates('como estas', '¿Cómo estás?', []);
    const { container } = render(
      <AnswerReveal submitted="como estas" result={result} primaryText="¿Cómo estás?" />,
    );
    expect(container.querySelector('.correct-answer')?.textContent).toBe('¿Cómo estás?');
    const marks = [...container.querySelectorAll('.answer-diff mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['ó', 'á']);
  });

  it('shows a hint when the match came from an alternate, not the primary', () => {
    const result = checkAnswerWithAlternates('el carro', 'el coche', [
      { id: 1, text: 'el auto' },
      { id: 2, text: 'el carro' },
    ]);
    render(
      <AnswerReveal
        submitted="el carro"
        result={result}
        primaryText="el coche"
        alternates={[]}
      />,
    );
    expect(screen.getByText('Matched an alternate answer')).toBeTruthy();
  });

  it('shows no hint when the primary itself matched', () => {
    const result = checkAnswerWithAlternates('el coche', 'el coche', [{ id: 1, text: 'el auto' }]);
    render(
      <AnswerReveal submitted="el coche" result={result} primaryText="el coche" alternates={[]} />,
    );
    expect(screen.queryByText('Matched an alternate answer')).toBeNull();
  });
});
