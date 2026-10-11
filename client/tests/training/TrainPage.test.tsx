// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerUnavailableError } from '../../src/api.js';
import { outboxKey } from '../../src/training/outbox.js';
import { TrainPage } from '../../src/training/TrainPage.js';

const { fetchTrainingQueue, addAlternateAnswer, fetchExplanation, checkSubmittedAnswer, submitReviews } =
  vi.hoisted(() => ({
    fetchTrainingQueue: vi.fn(),
    addAlternateAnswer: vi.fn(),
    fetchExplanation: vi.fn(),
    checkSubmittedAnswer: vi.fn(),
    submitReviews: vi.fn(),
  }));

vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/api.js')>('../../src/api.js');
  return {
    ...actual,
    fetchTrainingQueue,
    addAlternateAnswer,
    fetchExplanation,
    checkSubmittedAnswer,
    submitReviews,
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
  localStorage.clear();
  submitReviews.mockReset();
  submitReviews.mockImplementation(async (reviews: { clientReviewId: string }[]) =>
    reviews.map((r) => ({ clientReviewId: r.clientReviewId, status: 'applied' })),
  );
  fetchTrainingQueue.mockReset();
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
      feedbackPoints: ['Close enough'],
      submittedReading: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    source: 'cached',
  });
});

afterEach(cleanup);

describe('TrainPage Adopt', () => {
  it('does not offer to add a suggestion that duplicates the primary', async () => {
    render(
      <MemoryRouter>
        <TrainPage onLoggedOut={() => {}} userEmail="test@example.com" />
      </MemoryRouter>,
    );

    const answerInput = await screen.findByLabelText(/Your answer/);
    fireEvent.change(answerInput, { target: { value: 'perro' } });
    fireEvent.submit(answerInput.closest('form')!);

    fireEvent.click(await screen.findByRole('button', { name: /Explain/ }));
    await screen.findByText('Explanation');

    fireEvent.click(screen.getByRole('button', { name: 'Compare my answer' }));
    await screen.findByText(/already matches a saved answer/);

    expect(screen.queryByRole('button', { name: 'Add as alternative' })).toBeNull();
    expect(addAlternateAnswer).not.toHaveBeenCalled();
  });

  it('shows a visible error when adopting a non-duplicate suggestion fails', async () => {
    checkSubmittedAnswer.mockResolvedValue({
      answerCheck: {
        verdict: 'valid',
        suggestedAnswer: 'gatito',
        feedbackPoints: ['Close enough'],
      submittedReading: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      source: 'cached',
    });
    addAlternateAnswer.mockRejectedValue(new Error('Too many alternates'));

    render(
      <MemoryRouter>
        <TrainPage onLoggedOut={() => {}} userEmail="test@example.com" />
      </MemoryRouter>,
    );

    const answerInput = await screen.findByLabelText(/Your answer/);
    fireEvent.change(answerInput, { target: { value: 'perro' } });
    fireEvent.submit(answerInput.closest('form')!);

    fireEvent.click(await screen.findByRole('button', { name: /Explain/ }));
    await screen.findByText('Explanation');
    fireEvent.click(screen.getByRole('button', { name: 'Compare my answer' }));
    fireEvent.click(await screen.findByText('Add as alternative'));

    await waitFor(() => expect(addAlternateAnswer).toHaveBeenCalled());
    expect(await screen.findByText('Too many alternates')).toBeInTheDocument();
  });
});

const USER_KEY = outboxKey('test@example.com');

function renderTrainPage() {
  return render(
    <MemoryRouter>
      <TrainPage onLoggedOut={() => {}} userEmail="test@example.com" />
    </MemoryRouter>,
  );
}

function pendingReviews(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    cardId: 100 + i,
    rating: 'good',
    direction: 'spanish-to-english',
    verdict: 'correct',
    submittedText: 'x',
    matchedText: 'x',
    clientReviewId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    reviewedAt: '2026-01-01T00:00:00.000Z',
  }));
}

describe('TrainPage offline outbox', () => {
  it('advances immediately and shows a waiting-to-sync note when the network is down', async () => {
    submitReviews.mockRejectedValue(new ServerUnavailableError());
    renderTrainPage();
    const answerInput = await screen.findByLabelText(/Your answer/);
    fireEvent.change(answerInput, { target: { value: 'cat' } });
    fireEvent.submit(answerInput.closest('form')!);

    fireEvent.click(await screen.findByRole('button', { name: /Good/ }));

    expect(await screen.findByText(/All done/)).toBeInTheDocument();
    expect(screen.getByText(/1 review waiting to sync/)).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toHaveLength(1);
  });

  it('flushes reviews left from a previous load before fetching the queue', async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(pendingReviews(2)));
    renderTrainPage();

    await screen.findByLabelText(/Your answer/);

    expect(submitReviews).toHaveBeenCalledOnce();
    expect(submitReviews.mock.invocationCallOrder[0]!).toBeLessThan(
      fetchTrainingQueue.mock.invocationCallOrder[0]!,
    );
    expect(fetchTrainingQueue).toHaveBeenCalledOnce();
  });

  it('shows the unavailable message with a retry when the queue cannot be loaded offline', async () => {
    fetchTrainingQueue.mockRejectedValue(new ServerUnavailableError());
    renderTrainPage();

    expect(
      await screen.findByText(/The server is not available for this action\. Check your internet connection and try again\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('refuses to load the next queue while earlier reviews are still unsynced', async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(pendingReviews(1)));
    submitReviews.mockRejectedValue(new ServerUnavailableError());
    renderTrainPage();

    expect(await screen.findByText(/The server is not available for this action/)).toBeInTheDocument();
    expect(fetchTrainingQueue).not.toHaveBeenCalled();
  });
});
