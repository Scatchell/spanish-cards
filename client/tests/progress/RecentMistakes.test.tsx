// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { CategoryMistake } from '../../src/api.js';
import { RecentMistakes } from '../../src/progress/RecentMistakes.js';
import { makeMistake } from './fixtures.js';

afterEach(cleanup);

function renderRecent(items: CategoryMistake[]) {
  return render(
    <MemoryRouter>
      <RecentMistakes items={items} />
    </MemoryRouter>,
  );
}

describe('RecentMistakes', () => {
  it('renders one card per mistake, in the order given, with a link to see them all', () => {
    renderRecent([makeMistake({ id: 1, correctText: 'uno' }), makeMistake({ id: 2, correctText: 'dos' })]);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('uno');
    expect(cards[1]).toHaveTextContent('dos');
    expect(screen.getByRole('link', { name: 'See all mistakes' })).toHaveAttribute('href', '/mistakes');
  });

  it('shows a plain empty state when there are no mistakes', () => {
    renderRecent([]);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText(/No mistakes recorded yet/)).toBeInTheDocument();
  });
});
