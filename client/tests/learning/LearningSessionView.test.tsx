// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../../src/api.js';
import { LearningSessionView } from '../../src/learning/LearningSessionView.js';
import { markRemembered, startSession } from '../../src/learning/session.js';

afterEach(cleanup);

function makeCard(id: number): Card {
  return {
    id,
    spanishText: `es-${id}`,
    englishText: `en-${id}`,
    languagePair: 'en<->es',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    due: '2026-01-01T00:00:00.000Z',
    reviewed: false,
  };
}

function renderView(overrides?: Partial<Parameters<typeof LearningSessionView>[0]>) {
  const session = startSession([makeCard(1), makeCard(2)]);
  const props = {
    session,
    direction: 'english-to-spanish' as const,
    onToggleDirection: vi.fn(),
    onRemembered: vi.fn(),
    onStillLearning: vi.fn(),
    onKeepLearning: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <LearningSessionView {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('LearningSessionView', () => {
  it('renders the current card and wires Remembered/Still learning', () => {
    const { session, onRemembered } = renderView();
    expect(screen.getByText(session.queue[0]!.englishText)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remembered'));
    expect(onRemembered).toHaveBeenCalledOnce();
  });

  it('hides edit affordances when editable is false', () => {
    renderView({ editable: false });
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('shows edit affordances by default when onSavePrompt/onSaveAnswer are given', () => {
    renderView({ onSavePrompt: vi.fn(), onSaveAnswer: vi.fn() });
    expect(screen.getAllByRole('button', { name: /^Edit/ }).length).toBeGreaterThan(0);
  });

  it('shows the pass-complete screen once the queue is empty, with the remembered count', () => {
    let session = startSession([makeCard(1)]);
    session = markRemembered(session);
    renderView({ session });
    expect(screen.getByText('Pass complete! 🎉')).toBeInTheDocument();
    expect(screen.getByText(/You remembered all 1 card in this pass\./)).toBeInTheDocument();
  });

  it('calls onKeepLearning when "Keep learning these cards" is clicked', () => {
    let session = startSession([makeCard(1)]);
    session = markRemembered(session);
    const { onKeepLearning } = renderView({ session });
    fireEvent.click(screen.getByText('Keep learning these cards'));
    expect(onKeepLearning).toHaveBeenCalledOnce();
  });

  it('links "Start training" to /train', () => {
    let session = startSession([makeCard(1)]);
    session = markRemembered(session);
    renderView({ session });
    expect(screen.getByText('Start training').closest('a')).toHaveAttribute('href', '/train');
  });

  it('shows "Choose different cards" only when onChooseDifferentCards is provided', () => {
    let session = startSession([makeCard(1)]);
    session = markRemembered(session);
    const onChooseDifferentCards = vi.fn();
    renderView({ session, onChooseDifferentCards });
    fireEvent.click(screen.getByText('Choose different cards'));
    expect(onChooseDifferentCards).toHaveBeenCalledOnce();
  });

  it('hides "Choose different cards" when the handler is omitted', () => {
    let session = startSession([makeCard(1)]);
    session = markRemembered(session);
    renderView({ session });
    expect(screen.queryByText('Choose different cards')).not.toBeInTheDocument();
  });

  it('renders the footer regardless of active-card or pass-complete state', () => {
    const footer = <div>Custom footer</div>;
    renderView({ footer });
    expect(screen.getByText('Custom footer')).toBeInTheDocument();
    cleanup();

    let session = startSession([makeCard(1)]);
    session = markRemembered(session);
    renderView({ session, footer });
    expect(screen.getByText('Custom footer')).toBeInTheDocument();
  });
});
