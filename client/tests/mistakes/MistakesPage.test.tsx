// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { MistakesPage } from '../../src/mistakes/MistakesPage.js';
import * as api from '../../src/api.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof api>('../../src/api.js');
  return {
    ...actual,
    fetchCategorizationSummary: vi.fn(),
    fetchCategorizationMistakes: vi.fn(),
  };
});

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

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// Stands in for the browser Back button: MemoryRouter has no chrome, and data
// routers (which expose navigate(-1) directly) break on jsdom's AbortSignal.
function HistoryBackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      history back
    </button>
  );
}

function renderPage(initialPath = '/mistakes') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/mistakes/:category?" element={<MistakesPage onLoggedOut={() => {}} />} />
      </Routes>
      <LocationDisplay />
      <HistoryBackButton />
    </MemoryRouter>,
  );
}

function agreementMistake(id: number, correctText: string) {
  return {
    id,
    category: 'agreement',
    rationale: `rationale ${id}`,
    practiceTargets: [],
    correctText,
    submittedText: `wrong ${id}`,
    direction: 'english-to-spanish',
    verdict: 'incorrect',
    createdAt: '2026-09-12T14:03:11.000Z',
  };
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

  it('links "Practice this mistake" to the transient practice session route', async () => {
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

    expect(screen.getByRole('link', { name: /practice this mistake/i })).toHaveAttribute(
      'href',
      '/mistakes/1/practice',
    );
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
  it('puts the selected category in the URL', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 1 }));
    mockedMistakes.mockResolvedValue({ items: [agreementMistake(1, 'la casa blanca')], nextCursor: null });
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/mistakes/agreement'));
    await waitFor(() => expect(screen.getByText('la casa blanca')).toBeInTheDocument());
  });

  it('loads the category from a deep link without any click', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 1 }));
    mockedMistakes.mockResolvedValue({ items: [agreementMistake(1, 'la casa blanca')], nextCursor: null });
    renderPage('/mistakes/agreement');

    await waitFor(() => expect(screen.getByText('la casa blanca')).toBeInTheDocument());
    expect(mockedMistakes).toHaveBeenCalledWith('agreement', null);
  });

  it('clicking the open category again closes it and returns to /mistakes', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 1 }));
    mockedMistakes.mockResolvedValue({ items: [agreementMistake(1, 'la casa blanca')], nextCursor: null });
    renderPage('/mistakes/agreement');

    await waitFor(() => expect(screen.getByText('la casa blanca')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^agreement$/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/mistakes$/));
    expect(screen.queryByText('la casa blanca')).not.toBeInTheDocument();
  });

  it('redirects an unknown category slug to /mistakes without fetching mistakes', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 1 }));
    renderPage('/mistakes/nonsense');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/mistakes$/));
    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    expect(mockedMistakes).not.toHaveBeenCalled();
  });

  it('keeps loaded pages when switching away and back (no refetch)', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 2, vocabulary: 1 }));
    mockedMistakes.mockImplementation(async (category: string, cursor: string | null) => {
      if (category === 'vocabulary') return { items: [], nextCursor: null };
      return cursor
        ? { items: [agreementMistake(1, 'older')], nextCursor: null }
        : { items: [agreementMistake(2, 'newer')], nextCursor: 'cursor-1' };
    });
    renderPage('/mistakes/agreement');

    await waitFor(() => expect(screen.getByText('newer')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(screen.getByText('older')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /vocabulary/i }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/mistakes/vocabulary'));
    fireEvent.click(screen.getByRole('button', { name: /^agreement$/i }));

    await waitFor(() => expect(screen.getByText('older')).toBeInTheDocument());
    expect(screen.getByText('newer')).toBeInTheDocument();
    expect(mockedMistakes.mock.calls.filter(([c]) => c === 'agreement')).toHaveLength(2);
  });

  it('browser back from a category returns to the grid view', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 1 }));
    mockedMistakes.mockResolvedValue({ items: [agreementMistake(1, 'la casa blanca')], nextCursor: null });
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));
    await waitFor(() => expect(screen.getByText('la casa blanca')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'history back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/mistakes$/));
    expect(screen.queryByText('la casa blanca')).not.toBeInTheDocument();
  });
  it('marks the page as category-open only while a category is in the URL', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 1 }));
    mockedMistakes.mockResolvedValue({ items: [agreementMistake(1, 'la casa blanca')], nextCursor: null });
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    expect(container.querySelector('.mistakes-page')).not.toHaveClass('category-open');

    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));
    await waitFor(() => expect(container.querySelector('.mistakes-page')).toHaveClass('category-open'));
  });

  it('shows an "All categories" link, the category description, and an empty state in the drill-down', async () => {
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 0 }));
    mockedMistakes.mockResolvedValue({ items: [], nextCursor: null });
    renderPage('/mistakes/agreement');

    await waitFor(() => expect(screen.getByText(/no mistakes in this category yet/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /all categories/i })).toHaveAttribute('href', '/mistakes');
    const section = screen.getByRole('region', { name: /agreement mistakes/i });
    expect(section).toHaveTextContent('Gender or number mismatch between words.');
  });

  it('scrolls to the top when the opened panel starts above the viewport (phone: grid hidden)', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: -600 } as DOMRect);
    mockedSummary.mockResolvedValue(summaryWith({ recall_failure: 1 }));
    mockedMistakes.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();

    await waitFor(() => expect(screen.getByText("Didn't recall")).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /didn't recall/i }));

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
  });

  it('does not scroll when the opened panel is already below the grid (desktop)', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 700 } as DOMRect);
    mockedSummary.mockResolvedValue(summaryWith({ agreement: 1 }));
    mockedMistakes.mockResolvedValue({ items: [agreementMistake(1, 'la casa blanca')], nextCursor: null });
    renderPage();

    await waitFor(() => expect(screen.getByText('Agreement')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /agreement/i }));
    await waitFor(() => expect(screen.getByText('la casa blanca')).toBeInTheDocument());

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
