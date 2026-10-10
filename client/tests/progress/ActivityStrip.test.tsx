// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityStrip } from '../../src/progress/ActivityStrip.js';
import { makeReport } from './fixtures.js';

afterEach(cleanup);

const base = makeReport().summary;

function tile(label: string): HTMLElement {
  return screen.getByText(label, { exact: true }).closest('.stat-tile') as HTMLElement;
}

describe('ActivityStrip', () => {
  it('shows the current streak large with the best streak noted', () => {
    render(<ActivityStrip summary={base} />);
    expect(document.querySelector('.streak-number')).toHaveTextContent('6');
    expect(screen.getByText('day streak')).toBeInTheDocument();
    expect(screen.getByText('Best: 11 days')).toBeInTheDocument();
  });

  it('uses the singular for a one-day streak and celebrates a new best', () => {
    render(<ActivityStrip summary={{ ...base, currentStreak: 1, bestStreak: 1 }} />);
    expect(screen.getByText('Your longest streak yet')).toBeInTheDocument();
  });

  it('nudges the user to keep a live streak going when they have not studied today', () => {
    render(<ActivityStrip summary={{ ...base, reviewedToday: 0 }} />);
    expect(screen.getByText('Study today to keep it going')).toBeInTheDocument();
  });

  it('invites a new user to start a streak instead of showing a bare zero note', () => {
    render(
      <ActivityStrip
        summary={{ ...base, currentStreak: 0, bestStreak: 0, reviewedToday: 0, lastStudiedAt: null }}
      />,
    );
    expect(document.querySelector('.streak-number')).toHaveTextContent('0');
    expect(screen.getByText('Study today to start a streak')).toBeInTheDocument();
  });

  it('mentions the best streak when the current one has lapsed', () => {
    render(<ActivityStrip summary={{ ...base, currentStreak: 0, reviewedToday: 0 }} />);
    expect(screen.getByText('Study today to start a new streak. Your best is 11 days.')).toBeInTheDocument();
  });

  it('renders the small tiles', () => {
    render(<ActivityStrip summary={base} />);
    expect(tile('Reviewed today')).toHaveTextContent('39');
    expect(tile('Accuracy today')).toHaveTextContent('72%');
    expect(tile('Days studied (7d)')).toHaveTextContent('5');
    expect(tile('Days studied (30d)')).toHaveTextContent('19');
    expect(tile('Last studied')).toHaveTextContent(/jun/i);
  });

  it('shows placeholders when there is nothing to rate', () => {
    render(<ActivityStrip summary={{ ...base, accuracyToday: null, reviewedToday: 0, lastStudiedAt: null }} />);
    expect(tile('Accuracy today')).toHaveTextContent('—');
    expect(tile('Last studied')).toHaveTextContent('Never');
  });
});
