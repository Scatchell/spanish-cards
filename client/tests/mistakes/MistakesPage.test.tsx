// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { MistakesPage } from '../../src/mistakes/MistakesPage.js';
import * as api from '../../src/api.js';

afterEach(cleanup);

vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof api>('../../src/api.js');
  return {
    ...actual,
    fetchCategorizationSummary: vi.fn(),
    fetchCategorizationMistakes: vi.fn(),
  };
});

vi.mock('../../src/mistakes/PracticeModal.js', () => ({
  PracticeModal: ({ mistake, onClose }: { mistake: { correctText: string }; onClose: () => void }) => (
    <div role="dialog" aria-label="mock practice modal">
      <p>{mistake.correctText}</p>
      <button type="button" onClick={onClose}>
        Close mock modal
      </button>
    </div>
  ),
}));

const mockedSummary = api.fetchCategorizationSummary as unknown as ReturnType<typeof vi.fn>;
const mockedMistakes = api.fetchCategorizationMistakes as unknown as ReturnType<typeof vi.fn>;

function summaryWith(overrides: Partial<Record<string, number>>) {
  const categories = [
    'vocabulary',
    'verb_form',
    'agreement',
    'grammar_words',
    'word_order',
    'missing_extra_meaning',
    'spelling_accents',
    'idiom',
    'recall_failure',
  ].map((category) => ({ category, count: overrides[category] ?? 0 }));
  return { categories };
}

beforeEach(() => {
  mockedSummary.mockReset();
  mockedMistakes.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MistakesPage onLoggedOut={() => {}} />
    </MemoryRouter>,
  );
}

describe('MistakesPage', () => {
  it('renders all nine category cards from the summary, with zero-count categories muted and non-clickable', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 5 }));
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    expect(screen.getByText('Vocabulary')).toBeInTheDocument();
    expect(screen.queryByText(/Practice this category/i)).not.toBeInTheDocument();

    const vocabButton = screen.getByRole('button', { name: /vocabulary/i });
    fireEvent.click(vocabButton);
    expect(mockedMistakes).not.toHaveBeenCalled();
  });

  it('opens a category with mistakes and renders its table', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 2 }));
    mockedMistakes.mockResolvedValue({
      items: [
        {
          id: 1,
          category: 'agreement',
          rationale: 'la casa blanco should be la casa blanca',
          practiceTargets: [{ expected: 'blanca', submitted: 'blanco' }],
          correctText: 'la casa blanca',
          submittedText: 'la casa blanco',
          direction: 'english-to-spanish',
          verdict: 'incorrect',
          createdAt: '2026-09-12T14:03:11.000Z',
        },
      ],
      nextCursor: null,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));

    await waitFor(() => expect(screen.getByText('la casa blanca')).toBeInTheDocument());
    expect(screen.getByText('la casa blanco')).toBeInTheDocument();
    expect(screen.getByText(/la casa blanco should be la casa blanca/)).toBeInTheDocument();
    expect(screen.getByText('blanco → blanca')).toBeInTheDocument();
  });

  it('opens the practice modal for a mistake row and closes it', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 1 }));
    mockedMistakes.mockResolvedValue({
      items: [
        {
          id: 1,
          category: 'agreement',
          rationale: 'la casa blanco should be la casa blanca',
          practiceTargets: [{ expected: 'blanca', submitted: 'blanco' }],
          correctText: 'la casa blanca',
          submittedText: 'la casa blanco',
          direction: 'english-to-spanish',
          verdict: 'incorrect',
          createdAt: '2026-09-12T14:03:11.000Z',
        },
      ],
      nextCursor: null,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));
    await waitFor(() => expect(screen.getByText('la casa blanca')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /practice this mistake/i }));
    expect(screen.getByRole('dialog', { name: /mock practice modal/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close mock modal/i }));
    expect(screen.queryByRole('dialog', { name: /mock practice modal/i })).not.toBeInTheDocument();
  });

  it('loads more mistakes when Load more is clicked', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 2 }));
    mockedMistakes
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            category: 'agreement',
            rationale: 'r2',
            practiceTargets: [],
            correctText: 'c2',
            submittedText: 's2',
            direction: 'english-to-spanish',
            verdict: 'incorrect',
            createdAt: '2026-09-12T14:03:11.000Z',
          },
        ],
        nextCursor: '2026-09-12T14:03:11.000Z,2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            category: 'agreement',
            rationale: 'r1',
            practiceTargets: [],
            correctText: 'c1',
            submittedText: 's1',
            direction: 'english-to-spanish',
            verdict: 'incorrect',
            createdAt: '2026-09-11T14:03:11.000Z',
          },
        ],
        nextCursor: null,
      });
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));
    await waitFor(() => expect(screen.getByText('c2')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(screen.getByText('c1')).toBeInTheDocument());
    expect(screen.getByText('c2')).toBeInTheDocument();
    expect(mockedMistakes).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});
