// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainPage } from '../../src/training/TrainPage.js';

const { fetchTrainingQueue, addAlternateAnswer, fetchExplanation, checkSubmittedAnswer } = vi.hoisted(() => ({
  fetchTrainingQueue: vi.fn(),
  addAlternateAnswer: vi.fn(),
  fetchExplanation: vi.fn(),
  checkSubmittedAnswer: vi.fn(),
}));

vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/api.js')>('../../src/api.js');
  return {
    ...actual,
    fetchTrainingQueue,
    addAlternateAnswer,
    fetchExplanation,
    checkSubmittedAnswer,
  };
});

const CARD = {
  id: 1,
  spanishText: 'gato',
  englishText: 'cat',
  languagePair: 'en<->es',
  due: '2026-01-01T00:00:00.000Z',
  spanishAlternates: [{ id: 10, text: 'minino' }],
  englishAlternates: [],
};

beforeEach(() => {
  sessionStorage.clear();
  fetchTrainingQueue.mockResolvedValue([CARD]);
  addAlternateAnswer.mockResolvedValue({ id: 99, field: 'spanish', text: 'x', position: 1 });
  fetchExplanation.mockResolvedValue({
    explanation: { contentMarkdown: 'Explanation', model: 'test', createdAt: '2026-01-01T00:00:00.000Z' },
    source: 'cached',
  });
  checkSubmittedAnswer.mockResolvedValue({
    answerCheck: {
      verdict: 'valid',
      // Duplicates the primary answer 'gato' after normalization.
      suggestedAnswer: 'Gato',
      critiqueMarkdown: 'Close enough',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    source: 'cached',
  });
});

afterEach(cleanup);

describe('TrainPage Adopt', () => {
  it('does not call addAlternateAnswer when the suggested answer duplicates the primary', async () => {
    render(
      <MemoryRouter>
        <TrainPage onLoggedOut={() => {}} />
      </MemoryRouter>,
    );

    const answerInput = await screen.findByLabelText(/Your answer/);
    fireEvent.change(answerInput, { target: { value: 'perro' } });
    fireEvent.submit(answerInput.closest('form')!);

    fireEvent.click(await screen.findByRole('button', { name: /Explain/ }));
    await screen.findByText('Explanation');

    fireEvent.click(screen.getByRole('button', { name: 'Explain more' }));
    fireEvent.click(await screen.findByText('Adopt'));

    await waitFor(() => expect(fetchExplanation).toHaveBeenCalled());
    expect(addAlternateAnswer).not.toHaveBeenCalled();
  });

  it('shows a visible error when adopting a non-duplicate suggestion fails', async () => {
    checkSubmittedAnswer.mockResolvedValue({
      answerCheck: {
        verdict: 'valid',
        suggestedAnswer: 'gatito',
        critiqueMarkdown: 'Close enough',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      source: 'cached',
    });
    addAlternateAnswer.mockRejectedValue(new Error('Too many alternates'));

    render(
      <MemoryRouter>
        <TrainPage onLoggedOut={() => {}} />
      </MemoryRouter>,
    );

    const answerInput = await screen.findByLabelText(/Your answer/);
    fireEvent.change(answerInput, { target: { value: 'perro' } });
    fireEvent.submit(answerInput.closest('form')!);

    fireEvent.click(await screen.findByRole('button', { name: /Explain/ }));
    await screen.findByText('Explanation');
    fireEvent.click(screen.getByRole('button', { name: 'Explain more' }));
    fireEvent.click(await screen.findByText('Adopt'));

    await waitFor(() => expect(addAlternateAnswer).toHaveBeenCalled());
    expect(await screen.findByText('Too many alternates')).toBeInTheDocument();
  });
});
