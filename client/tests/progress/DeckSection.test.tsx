// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DeckSection } from '../../src/progress/DeckSection.js';
import { makeReport } from './fixtures.js';

afterEach(cleanup);

const { deck, trend } = makeReport();

function renderDeck(overrides: Partial<typeof deck> = {}, last7Days = trend.last7Days) {
  return render(
    <MemoryRouter>
      <DeckSection deck={{ ...deck, ...overrides }} last7Days={last7Days} />
    </MemoryRouter>,
  );
}

function tile(label: string): HTMLElement {
  return screen.getByText(label, { exact: true }).closest('.stat-tile') as HTMLElement;
}

describe('DeckSection', () => {
  it('shows the card total and one tile per bucket', () => {
    renderDeck();
    expect(screen.getByText('40 cards')).toBeInTheDocument();
    expect(tile('Mastered')).toHaveTextContent('6');
    expect(tile('Familiar')).toHaveTextContent('10');
    expect(tile('Learning')).toHaveTextContent('12');
    expect(tile('Lapsed')).toHaveTextContent('4');
    expect(tile('New')).toHaveTextContent('8');
  });

  it('describes the composition bar for assistive tech', () => {
    renderDeck();
    expect(
      screen.getByRole('img', { name: 'Deck: 6 mastered, 10 familiar, 12 learning, 4 lapsed, 8 new' }),
    ).toBeInTheDocument();
  });

  it('draws a segment only for buckets that have cards', () => {
    renderDeck({ mastered: 0, familiar: 0, lapsed: 0, learning: 40, new: 0, total: 40 });
    const bar = screen.getByRole('img', { name: /^Deck:/ });
    expect(bar.querySelectorAll('.deck-segment')).toHaveLength(1);
  });

  it('invites a click until a box is selected', () => {
    renderDeck();
    expect(screen.getByText('Select a box to see what it means.')).toBeInTheDocument();
    for (const name of ['Mastered', 'Familiar', 'Learning', 'Lapsed', 'New']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('explains only the selected bucket and spotlights its bar segment', () => {
    renderDeck({ masteredThresholdDays: 21 });
    fireEvent.click(screen.getByRole('button', { name: /Mastered/ }));
    expect(screen.getByRole('status')).toHaveTextContent('You would likely still remember these in 21 days.');
    expect(screen.getByRole('button', { name: /Mastered/ })).toHaveAttribute('aria-pressed', 'true');
    const selected = screen.getByRole('img', { name: /^Deck:/ }).querySelectorAll('.is-selected');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveClass('deck-mastered');

    fireEvent.click(screen.getByRole('button', { name: /Lapsed/ }));
    expect(screen.getByRole('status')).toHaveTextContent('You forgot these and are relearning them.');
    expect(screen.getByRole('button', { name: /Mastered/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clears the selection when the same box is clicked again', () => {
    renderDeck();
    const learning = screen.getByRole('button', { name: /Learning/ });
    fireEvent.click(learning);
    fireEvent.click(learning);
    expect(screen.getByText('Select a box to see what it means.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Deck:/ })).not.toHaveClass('has-selection');
  });

  it('compares cards added with cards reviewed in the last 7 days, and flags due cards', () => {
    renderDeck({}, { reviews: 200, correct: 150, accuracy: 0.75, cardsAdded: 12 });
    expect(tile('Due now')).toHaveTextContent('9');
    expect(tile('Due now')).toHaveClass('emphasized');
    expect(tile('Added (7d)')).toHaveTextContent('12');
    expect(tile('Reviewed (7d)')).toHaveTextContent('200');
  });

  it('does not emphasize Due now when nothing is due', () => {
    renderDeck({ dueNow: 0 });
    expect(tile('Due now')).not.toHaveClass('emphasized');
  });

  it('uses the singular for a one-card deck', () => {
    renderDeck({ total: 1, mastered: 0, familiar: 0, learning: 0, lapsed: 0, new: 1 });
    expect(screen.getByText('1 card')).toBeInTheDocument();
  });

  it('invites the user to add cards when the deck is empty, with no bar', () => {
    renderDeck({ total: 0, mastered: 0, familiar: 0, learning: 0, lapsed: 0, new: 0, dueNow: 0 });
    expect(screen.getByText('0 cards')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Deck:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add some cards' })).toHaveAttribute('href', '/');
  });
});
