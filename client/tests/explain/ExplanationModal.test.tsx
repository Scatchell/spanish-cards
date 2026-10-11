// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerUnavailableError } from '../../src/api.js';
import { ExplanationModal } from '../../src/explain/ExplanationModal.js';

const { fetchExplanation, checkSubmittedAnswer, askFollowUp } = vi.hoisted(() => ({
  fetchExplanation: vi.fn(),
  checkSubmittedAnswer: vi.fn(),
  askFollowUp: vi.fn(),
}));
vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/api.js')>('../../src/api.js');
  return { ...actual, fetchExplanation, checkSubmittedAnswer, askFollowUp };
});

const MESSAGE =
  'The server is not available for this action. Check your internet connection and try again.';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  fetchExplanation.mockResolvedValue({
    explanation: { contentMarkdown: 'Explanation text', model: 'm', createdAt: '2026-01-01T00:00:00.000Z' },
    source: 'cached',
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderModal() {
  return render(
    <ExplanationModal
      cardId={1}
      spanishText="gato"
      englishText="cat"
      submittedAnswer="perro"
      direction="spanish-to-english"
      verdict="incorrect"
      existingAnswers={['cat']}
      onAdoptAnswer={() => {}}
      onClose={() => {}}
    />,
  );
}

describe('ExplanationModal offline errors', () => {
  it('shows the unavailable message when the explanation cannot be fetched', async () => {
    fetchExplanation.mockRejectedValue(new ServerUnavailableError());
    renderModal();
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
  });

  it('keeps the generic explanation error for other failures', async () => {
    fetchExplanation.mockRejectedValue(new Error('boom'));
    renderModal();
    expect(await screen.findByText(/Something went wrong with this explanation/)).toBeInTheDocument();
  });

  it('shows the unavailable message when comparing the answer fails offline', async () => {
    checkSubmittedAnswer.mockRejectedValue(new ServerUnavailableError());
    renderModal();
    await screen.findByText('Explanation text');
    fireEvent.click(screen.getByRole('button', { name: 'Compare my answer' }));
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
  });

  it('shows the unavailable message when a follow-up fails offline', async () => {
    askFollowUp.mockRejectedValue(new ServerUnavailableError());
    renderModal();
    await screen.findByText('Explanation text');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'why?' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
  });
});
