// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainPage } from '../../src/training/TrainPage.js';

const { fetchTrainingQueue, enqueue, flush } = vi.hoisted(() => ({
  fetchTrainingQueue: vi.fn(),
  enqueue: vi.fn(),
  // Stable identity: TrainPage reloads the queue whenever flush changes.
  flush: vi.fn(async () => true),
}));
vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/api.js')>('../../src/api.js');
  return { ...actual, fetchTrainingQueue };
});
vi.mock('../../src/training/useReviewOutbox.js', () => ({
  useReviewOutbox: () => ({
    pendingCount: 50,
    isFull: true,
    enqueue,
    flush,
  }),
}));

beforeEach(() => {
  fetchTrainingQueue.mockResolvedValue([
    {
      id: 1,
      spanishText: 'gato',
      englishText: 'cat',
      languagePair: 'en<->es',
      due: '2026-01-01T00:00:00.000Z',
      spanishAlternates: [],
      englishAlternates: [],
    },
  ]);
});
afterEach(cleanup);

describe('TrainPage with a full outbox', () => {
  it('disables rating and explains why', async () => {
    render(
      <MemoryRouter>
        <TrainPage onLoggedOut={() => {}} userEmail="test@example.com" />
      </MemoryRouter>,
    );
    const answerInput = await screen.findByLabelText(/Your answer/);
    fireEvent.change(answerInput, { target: { value: 'perro' } });
    fireEvent.submit(answerInput.closest('form')!);

    expect(await screen.findByText(/50 reviews waiting to sync/)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /Good|Easy|Hard|Don't remember/ })) {
      expect(button).toBeDisabled();
    }
    expect(enqueue).not.toHaveBeenCalled();
  });
});
