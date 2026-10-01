// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerCheckResult } from '../../src/explain/AnswerCheckResult.js';

afterEach(cleanup);

const BASE = {
  verdict: 'invalid' as const,
  suggestedAnswer: null,
  feedbackPoints: ['You used the *present* tense.', 'You left out *la*.'],
  submittedReading: { text: 'No usas en mi contra?', translation: "You don't use in my against?" },
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderResult(overrides = {}, direction: 'spanish-to-english' | 'english-to-spanish' = 'english-to-spanish') {
  const onAdopt = vi.fn();
  render(
    <AnswerCheckResult
      answerCheck={{ ...BASE, ...overrides }}
      spanishText="No la usarás en mi contra?"
      englishText="Won't you use it against me?"
      direction={direction}
      onAdopt={onAdopt}
    />,
  );
  return onAdopt;
}

describe('AnswerCheckResult', () => {
  it('renders each feedback point as a bullet with inline emphasis', () => {
    const { container } = render(
      <AnswerCheckResult
        answerCheck={BASE}
        spanishText="s"
        englishText="e"
        direction="english-to-spanish"
        onAdopt={() => {}}
      />,
    );
    expect(container.querySelectorAll('.answer-check-points li')).toHaveLength(2);
    expect(container.querySelector('.answer-check-points em')?.textContent).toBe('present');
  });

  it('compares the typed reading with the card, Spanish typed → English translation', () => {
    renderResult();
    expect(screen.getByText('No usas en mi contra?')).toBeTruthy();
    expect(screen.getByText("You don't use in my against?")).toBeTruthy();
    expect(screen.getByText('No la usarás en mi contra?')).toBeTruthy();
    expect(screen.getByText("Won't you use it against me?")).toBeTruthy();
  });

  it('swaps the correct phrase and translation when English was typed', () => {
    const { container } = render(
      <AnswerCheckResult
        answerCheck={BASE}
        spanishText="la casa"
        englishText="the house"
        direction="spanish-to-english"
        onAdopt={() => {}}
      />,
    );
    expect(container.querySelector('.answer-compare-correct .answer-compare-text')?.textContent).toBe(
      'the house',
    );
    expect(
      container.querySelector('.answer-compare-correct .answer-compare-translation')?.textContent,
    ).toBe('la casa');
  });

  it('omits the "Your answer" row when there is no reading', () => {
    renderResult({ submittedReading: null });
    expect(screen.queryByText('Your answer')).toBeNull();
    expect(screen.getByText('Correct answer')).toBeTruthy();
  });

  it('offers add-as-alternative only for a valid verdict with a suggestion', () => {
    renderResult();
    expect(screen.queryByRole('button', { name: 'Add as alternative' })).toBeNull();
    cleanup();

    renderResult({ verdict: 'invalid', suggestedAnswer: 'ignored' });
    expect(screen.queryByRole('button', { name: 'Add as alternative' })).toBeNull();
    cleanup();

    const onAdopt = renderResult({ verdict: 'valid', suggestedAnswer: 'la mejor versión' });
    fireEvent.click(screen.getByRole('button', { name: 'Add as alternative' }));
    expect(onAdopt).toHaveBeenCalledWith('la mejor versión');
  });
});
