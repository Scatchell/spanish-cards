// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api.js';
import { ProgressPage } from '../../src/progress/ProgressPage.js';
import { makeReport } from './fixtures.js';

vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof api>('../../src/api.js');
  return { ...actual, fetchProgress: vi.fn() };
});

const mockedFetch = api.fetchProgress as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mockedFetch.mockReset());
afterEach(cleanup);

function renderPage(onLoggedOut = vi.fn()) {
  render(
    <MemoryRouter>
      <ProgressPage onLoggedOut={onLoggedOut} />
    </MemoryRouter>,
  );
  return onLoggedOut;
}

describe('ProgressPage', () => {
  it('shows a loading state, then every section', async () => {
    mockedFetch.mockResolvedValue(makeReport());
    renderPage();
    expect(screen.getByText('Loading progress…')).toBeInTheDocument();

    expect(await screen.findByRole('region', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accuracy' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Time range' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Deck overview' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent mistakes' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('replaces the chart with a prompt to train when there is no history', async () => {
    const empty = makeReport();
    mockedFetch.mockResolvedValue({
      ...empty,
      summary: { ...empty.summary, lastStudiedAt: null, currentStreak: 0, bestStreak: 0, reviewedToday: 0 },
      deck: { ...empty.deck, total: 0, mastered: 0, familiar: 0, learning: 0, lapsed: 0, new: 0, dueNow: 0 },
      recentMistakes: [],
    });
    renderPage();

    expect(await screen.findByText(/No reviews yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'train some cards' })).toHaveAttribute('href', '/train');
    expect(screen.queryByRole('group', { name: 'Time range' })).not.toBeInTheDocument();
    expect(screen.getByText(/No mistakes recorded yet/)).toBeInTheDocument();
    expect(screen.getByText('0 cards')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(makeReport());
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'Activity' })).toBeInTheDocument();
  });

  it('logs out on a 401 instead of showing an error', async () => {
    mockedFetch.mockRejectedValueOnce(new api.ApiError(401, 'Unauthorized'));
    const onLoggedOut = renderPage();
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
