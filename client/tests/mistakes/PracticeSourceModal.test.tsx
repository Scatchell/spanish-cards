// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PracticeSessionDto } from '../../src/api.js';
import { PracticeSourceModal } from '../../src/mistakes/PracticeSourceModal.js';

afterEach(cleanup);

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

describe('PracticeSourceModal', () => {
  it('always shows the historical examples, with no hide/show toggle', () => {
    render(
      <PracticeSourceModal session={SESSION} regenerating={false} onRegenerate={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByText('a white chair')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hide historical examples/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show historical examples/i })).not.toBeInTheDocument();
  });

  it('does not show the generated practice sentences (they are already the cards in play)', () => {
    render(
      <PracticeSourceModal session={SESSION} regenerating={false} onRegenerate={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByText('the white table')).not.toBeInTheDocument();
  });

  it('calls onRegenerate when Regenerate is clicked', () => {
    const onRegenerate = vi.fn();
    render(
      <PracticeSourceModal session={SESSION} regenerating={false} onRegenerate={onRegenerate} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('disables Regenerate while regenerating', () => {
    render(
      <PracticeSourceModal session={SESSION} regenerating={true} onRegenerate={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /regenerating/i })).toBeDisabled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <PracticeSourceModal session={SESSION} regenerating={false} onRegenerate={() => {}} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
