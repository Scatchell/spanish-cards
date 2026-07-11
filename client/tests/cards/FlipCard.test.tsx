// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlipCard } from '../../src/cards/FlipCard.js';

afterEach(cleanup);

function makeCard(overrides?: Partial<{ id: number; spanishText: string; englishText: string; languagePair: string; due: string }>) {
  return {
    id: 1,
    spanishText: 'gato',
    englishText: 'cat',
    languagePair: 'en<->es',
    due: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderFlipCard(overrides?: Parameters<typeof makeCard>[0]) {
  const onRemembered = vi.fn();
  const onStillLearning = vi.fn();
  render(
    <FlipCard
      card={makeCard(overrides)}
      direction="spanish-to-english"
      onRemembered={onRemembered}
      onStillLearning={onStillLearning}
    />,
  );
  return { onRemembered, onStillLearning };
}

function answerHidden(): boolean {
  return screen.getByLabelText('Answer').getAttribute('aria-hidden') === 'true';
}

describe('FlipCard', () => {
  it('hides the answer initially', () => {
    renderFlipCard();
    expect(answerHidden()).toBe(true);
  });

  it('reveals the answer when Show answer button is clicked', () => {
    renderFlipCard();
    fireEvent.click(screen.getByText('Show answer'));
    expect(answerHidden()).toBe(false);
  });

  it('reveals the answer on Space keydown', () => {
    renderFlipCard();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(answerHidden()).toBe(false);
  });

  it('calls onRemembered when Remembered button is clicked', () => {
    const { onRemembered } = renderFlipCard();
    fireEvent.click(screen.getByText('Remembered'));
    expect(onRemembered).toHaveBeenCalledOnce();
  });

  it('calls onStillLearning when Still learning button is clicked', () => {
    const { onStillLearning } = renderFlipCard();
    fireEvent.click(screen.getByText('Still learning'));
    expect(onStillLearning).toHaveBeenCalledOnce();
  });

  it('calls onRemembered on key 1', () => {
    const { onRemembered } = renderFlipCard();
    fireEvent.keyDown(window, { key: '1' });
    expect(onRemembered).toHaveBeenCalledOnce();
  });

  it('calls onStillLearning on key 2', () => {
    const { onStillLearning } = renderFlipCard();
    fireEvent.keyDown(window, { key: '2' });
    expect(onStillLearning).toHaveBeenCalledOnce();
  });

  it('calls onRemembered on Numpad1', () => {
    const { onRemembered } = renderFlipCard();
    fireEvent.keyDown(window, { code: 'Numpad1' });
    expect(onRemembered).toHaveBeenCalledOnce();
  });

  it('renders custom labels', () => {
    const onRemembered = vi.fn();
    const onStillLearning = vi.fn();
    const { container } = render(
      <FlipCard
        card={makeCard()}
        direction="spanish-to-english"
        onRemembered={onRemembered}
        onStillLearning={onStillLearning}
        rememberedLabel="Got it"
        stillLearningLabel="Not yet"
      />,
    );
    expect(container.textContent).toContain('Got it');
    expect(container.textContent).toContain('Not yet');
  });

  it('resets to hidden when card id changes', () => {
    const onRemembered = vi.fn();
    const onStillLearning = vi.fn();
    const { rerender } = render(
      <FlipCard
        card={makeCard({ id: 1 })}
        direction="spanish-to-english"
        onRemembered={onRemembered}
        onStillLearning={onStillLearning}
      />,
    );
    fireEvent.click(screen.getByText('Show answer'));
    expect(answerHidden()).toBe(false);

    rerender(
      <FlipCard
        card={makeCard({ id: 2, spanishText: 'perro', englishText: 'dog' })}
        direction="spanish-to-english"
        onRemembered={onRemembered}
        onStillLearning={onStillLearning}
      />,
    );
    expect(answerHidden()).toBe(true);
  });
});
