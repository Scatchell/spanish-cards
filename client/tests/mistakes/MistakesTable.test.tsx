// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { CategoryMistake } from '../../src/api.js';
import { MistakesTable } from '../../src/mistakes/MistakesTable.js';

afterEach(cleanup);

function mistake(overrides: Partial<CategoryMistake> = {}): CategoryMistake {
  return {
    id: 7,
    category: 'agreement',
    rationale: 'blanco should agree with casa',
    practiceTargets: [{ expected: 'blanca', submitted: 'blanco' }],
    correctText: 'la casa blanca',
    submittedText: 'la casa blanco',
    direction: 'english-to-spanish',
    verdict: 'incorrect',
    createdAt: '2026-09-12T14:03:11.000Z',
    ...overrides,
  };
}

function renderTable(items: CategoryMistake[]) {
  return render(
    <MemoryRouter>
      <MistakesTable items={items} />
    </MemoryRouter>,
  );
}

describe('MistakesTable', () => {
  it('keeps table semantics through explicit roles', () => {
    renderTable([mistake()]);

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Correct',
      'Submitted',
      'Rationale',
      'Practice targets',
      'Practice',
      'When',
    ]);
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('labels the data cells so the narrow layout can print them', () => {
    renderTable([mistake()]);

    const labelled = screen.getAllByRole('cell').filter((c) => c.hasAttribute('data-label'));
    expect(labelled.map((c) => c.getAttribute('data-label'))).toEqual([
      'Correct',
      'Submitted',
      'Rationale',
      'Practice targets',
    ]);
  });

  it('renders the practice link and a short date', () => {
    renderTable([mistake()]);

    expect(screen.getByRole('link', { name: 'Practice this mistake' })).toHaveAttribute(
      'href',
      '/mistakes/7/practice',
    );
    expect(screen.getByRole('cell', { name: /sep/i })).toBeInTheDocument();
  });

  it('leaves the practice-targets cell empty and unlabelled when there are none', () => {
    renderTable([mistake({ practiceTargets: [] })]);

    const empty = screen
      .getAllByRole('cell')
      .find((c) => c.classList.contains('mistake-targets-empty'));
    expect(empty).toBeDefined();
    expect(empty).not.toHaveAttribute('data-label');
    expect(empty).toBeEmptyDOMElement();
  });

  it('shows "(nothing entered)" for a target with a null submission', () => {
    renderTable([mistake({ practiceTargets: [{ expected: 'blanca', submitted: null }] })]);

    expect(screen.getByText('(nothing entered) → blanca')).toBeInTheDocument();
  });

  it('renders one body row per mistake', () => {
    renderTable([mistake({ id: 1 }), mistake({ id: 2, correctText: 'otra' })]);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[2] as HTMLElement).getByText('otra')).toBeInTheDocument();
  });
});
