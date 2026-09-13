// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { PracticeModal } from '../../src/mistakes/PracticeModal.js';
import type { CategoryMistake, PracticeSessionDto } from '../../src/api.js';
import * as api from '../../src/api.js';

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

const MISTAKE: CategoryMistake = {
  id: 5,
  category: 'agreement',
  rationale: 'la casa blanco should be la casa blanca',
  practiceTargets: [{ expected: 'blanca', submitted: 'blanco' }],
  correctText: 'la casa blanca',
  submittedText: 'la casa blanco',
  direction: 'english-to-spanish',
  verdict: 'incorrect',
  createdAt: '2026-09-12T14:03:11.000Z',
};

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
  sentences: [{ spanish: 'la mesa blanca', english: 'the white table' }],
};

beforeEach(() => {
  mockedFetch.mockReset();
  mockedGenerate.mockReset();
});

describe('PracticeModal', () => {
  it('auto-generates when no session exists yet, then shows examples and sentences', async () => {
    mockedFetch.mockResolvedValue(null);
    mockedGenerate.mockResolvedValue(SESSION);

    render(<PracticeModal mistake={MISTAKE} onClose={() => {}} />);

    expect(screen.getByText(/Gathering examples/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('the white table')).toBeInTheDocument());
    expect(screen.getByText('a white chair')).toBeInTheDocument();
    expect(mockedGenerate).toHaveBeenCalledWith(5);
  });

  it('loads an existing session instantly without calling generate', async () => {
    mockedFetch.mockResolvedValue(SESSION);

    render(<PracticeModal mistake={MISTAKE} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('the white table')).toBeInTheDocument());
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('regenerates on button click', async () => {
    mockedFetch.mockResolvedValue(SESSION);
    const regenerated = { ...SESSION, sentences: [{ spanish: 'el coche blanco', english: 'the white car' }] };
    mockedGenerate.mockResolvedValue(regenerated);

    render(<PracticeModal mistake={MISTAKE} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('the white table')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    await waitFor(() => expect(screen.getByText('the white car')).toBeInTheDocument());
    expect(mockedGenerate).toHaveBeenCalledWith(5);
  });

  it('calls onClose when the close button is clicked', async () => {
    mockedFetch.mockResolvedValue(SESSION);
    const onClose = vi.fn();
    render(<PracticeModal mistake={MISTAKE} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('the white table')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
