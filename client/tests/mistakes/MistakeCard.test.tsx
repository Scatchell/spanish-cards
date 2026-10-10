// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { CategoryMistake } from '../../src/api.js';
import { MistakeCard } from '../../src/mistakes/MistakeCard.js';
import { makeMistake } from '../progress/fixtures.js';

afterEach(cleanup);

function renderCard(overrides: Partial<CategoryMistake> = {}) {
  return render(
    <MemoryRouter>
      <MistakeCard item={makeMistake(overrides)} />
    </MemoryRouter>,
  );
}

describe('MistakeCard', () => {
  it('shows the category, date, correct and submitted text', () => {
    renderCard({ category: 'idiom' });
    expect(screen.getByText('Idiom')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('la casa blanca')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('la casa blanco')).toBeInTheDocument();
    expect(screen.getByText(/jun/i)).toBeInTheDocument();
  });

  it('links Practice to this mistake', () => {
    renderCard({ id: 42 });
    expect(screen.getByRole('link', { name: 'Practice this mistake' })).toHaveAttribute(
      'href',
      '/mistakes/42/practice',
    );
  });

  it('renders practice targets as pills, including a blank submission', () => {
    renderCard({
      practiceTargets: [
        { expected: 'blanca', submitted: 'blanco' },
        { expected: 'casa', submitted: null },
      ],
    });
    expect(screen.getByText('blanco → blanca')).toBeInTheDocument();
    expect(screen.getByText('(nothing entered) → casa')).toBeInTheDocument();
  });

  it('omits the practice-targets block when there are none', () => {
    renderCard({ practiceTargets: [] });
    expect(screen.queryByText('Practice targets')).not.toBeInTheDocument();
  });

  it('collapses a long rationale behind a Show more toggle', () => {
    const long = 'x'.repeat(200);
    renderCard({ rationale: long });
    expect(screen.getByText(long)).toHaveClass('is-clamped');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText(long)).not.toHaveClass('is-clamped');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows no toggle for a short rationale', () => {
    renderCard({ rationale: 'short' });
    expect(screen.queryByRole('button', { name: /show (more|less)/i })).not.toBeInTheDocument();
  });
});
