// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeSessionDto } from '../../src/api.js';
import * as api from '../../src/api.js';
import { PracticeMistakePage } from '../../src/mistakes/PracticeMistakePage.js';

afterEach(cleanup);

vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof api>('../../src/api.js');
  return {
    ...actual,
    fetchPracticeSession: vi.fn(),
    generatePracticeSession: vi.fn(),
  };
});

const mockedFetch = api.fetchPracticeSession as unknown as ReturnType<typeof vi.fn>;
const mockedGenerate = api.generatePracticeSession as unknown as ReturnType<typeof vi.fn>;

const SESSION: PracticeSessionDto = {
  id: 1,
  reviewCategorizationId: 5,
  model: 'gpt-5.4',
  generatedAt: '2026-09-13T00:00:00.000Z',
  examples: [
    {
      cardId: 1,
      category: 'agreement',
      correctText: 'una silla blanca',
      submittedText: 'una silla blanco',
      direction: 'english-to-spanish',
      rationale: 'r',
      spanishText: 'una silla blanca',
      englishText: 'a white chair',
      practiceTargets: [],
      tier: 1,
    },
  ],
  sentences: Array.from({ length: 10 }, (_, i) => ({
    spanish: `es-${i + 1}`,
    english: `en-${i + 1}`,
  })),
};

beforeEach(() => {
  mockedFetch.mockReset();
  mockedGenerate.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/mistakes/5/practice']}>
      <Routes>
        <Route path="/mistakes/:categorizationId/practice" element={<PracticeMistakePage onLoggedOut={() => {}} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PracticeMistakePage', () => {
  it('shows a loading state, then starts a learn session with the generated sentences', async () => {
    mockedFetch.mockResolvedValue(null);
    mockedGenerate.mockResolvedValue(SESSION);

    renderPage();

    expect(screen.getByText(/Gathering examples/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/en-\d+/)).toBeInTheDocument());
    expect(mockedGenerate).toHaveBeenCalledWith(5);
  });

  it('uses an existing session without generating', async () => {
    mockedFetch.mockResolvedValue(SESSION);
    renderPage();
    await waitFor(() => expect(screen.getByText(/en-\d+/)).toBeInTheDocument());
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('does not show an edit pencil on the practice cards', async () => {
    mockedFetch.mockResolvedValue(SESSION);
    renderPage();
    await waitFor(() => expect(screen.getByText(/en-\d+/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('never shows "Choose different cards" on pass-complete', async () => {
    mockedFetch.mockResolvedValue({ ...SESSION, sentences: [SESSION.sentences[0]!] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/en-1/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remembered'));
    await waitFor(() => expect(screen.getByText('Pass complete! 🎉')).toBeInTheDocument());
    expect(screen.queryByText('Choose different cards')).not.toBeInTheDocument();
  });

  it('opens the source modal from the persistent link and shows historical examples', async () => {
    mockedFetch.mockResolvedValue(SESSION);
    renderPage();
    await waitFor(() => expect(screen.getByText(/en-\d+/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /see mistakes used to generate these cards/i }));
    expect(screen.getByText('a white chair')).toBeInTheDocument();
  });

  it('restarts the session with fresh cards after regenerating from the source modal', async () => {
    mockedFetch.mockResolvedValue({ ...SESSION, sentences: [{ spanish: 'es-old', english: 'en-old' }] });
    const regenerated = { ...SESSION, sentences: [{ spanish: 'es-new', english: 'en-new' }] };
    mockedGenerate.mockResolvedValue(regenerated);
    renderPage();
    await waitFor(() => expect(screen.getByText('en-old')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /see mistakes used to generate these cards/i }));
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    await waitFor(() => expect(screen.getByText('en-new')).toBeInTheDocument());
    expect(screen.queryByText('en-old')).not.toBeInTheDocument();
  });
});
