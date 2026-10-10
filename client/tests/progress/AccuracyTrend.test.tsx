// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccuracyTrend } from '../../src/progress/AccuracyTrend.js';
import { makeReport } from './fixtures.js';

afterEach(cleanup);

const { trend } = makeReport();
const columns = () => screen.getAllByRole('img');

describe('AccuracyTrend', () => {
  it('defaults to 30 days with that button pressed', () => {
    render(<AccuracyTrend trend={trend} />);
    expect(columns()).toHaveLength(30);
    const group = screen.getByRole('group', { name: 'Time range' });
    expect(within(group).getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches between 7 days, 30 days and all time without refetching', () => {
    render(<AccuracyTrend trend={trend} />);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(columns()).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(columns()).toHaveLength(trend.weekly.length);
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    expect(columns()).toHaveLength(30);
  });

  it('describes each column for assistive tech, including days with no reviews', () => {
    render(<AccuracyTrend trend={trend} />);
    expect(columns()[0]).toHaveAccessibleName(/May 12: no reviews/);
    expect(columns()[1]).toHaveAccessibleName(/May 13: 73% correct, 11 reviews/);
  });

  it('shows the period summary until a column is hovered, then that day, then reverts', () => {
    render(<AccuracyTrend trend={trend} />);
    const readout = screen.getByRole('status');
    expect(readout).toHaveTextContent(/Last 30 days: \d+% correct, \d+ reviews/);

    fireEvent.mouseEnter(columns()[1] as HTMLElement);
    expect(readout).toHaveTextContent('May 13: 73% correct, 11 reviews');

    fireEvent.mouseLeave(columns()[1] as HTMLElement);
    expect(readout).toHaveTextContent(/Last 30 days/);
  });

  it('shows a column on keyboard focus too', () => {
    render(<AccuracyTrend trend={trend} />);
    fireEvent.focus(columns()[1] as HTMLElement);
    expect(screen.getByRole('status')).toHaveTextContent('May 13: 73% correct, 11 reviews');
  });

  it('resets the readout when the range changes', () => {
    render(<AccuracyTrend trend={trend} />);
    fireEvent.mouseEnter(columns()[1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Last 7 days/);
  });

  it('labels weekly points with their date span', () => {
    render(<AccuracyTrend trend={trend} />);
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(columns()[1]).toHaveAccessibleName(/May 14 – May 20: 70% correct, 90 reviews/);
  });

  it('compares the last 7 days with the 7 before', () => {
    render(<AccuracyTrend trend={trend} />);
    expect(screen.getByText(/Last 7 days: 75% \(200 reviews\)/)).toBeInTheDocument();
    expect(screen.getByText(/Previous 7 days: 70% \(150 reviews\)/)).toBeInTheDocument();
    expect(screen.getByText('Up 5 points')).toBeInTheDocument();
  });

  it('says so when there were no reviews in the last 7 days, and omits the delta', () => {
    const quiet = {
      ...trend,
      thisWeek: { reviews: 0, correct: 0, accuracy: null, cardsAdded: 0 },
    };
    render(<AccuracyTrend trend={quiet} />);
    expect(screen.getByText('No reviews in the last 7 days.')).toBeInTheDocument();
    expect(screen.queryByText(/points/)).not.toBeInTheDocument();
  });

  it('omits the delta when the previous 7 days had no reviews', () => {
    const fresh = {
      ...trend,
      lastWeek: { reviews: 0, correct: 0, accuracy: null, cardsAdded: 0 },
    };
    render(<AccuracyTrend trend={fresh} />);
    expect(screen.getByText(/Last 7 days: 75%/)).toBeInTheDocument();
    expect(screen.queryByText(/Previous 7 days/)).not.toBeInTheDocument();
    expect(screen.queryByText(/points/)).not.toBeInTheDocument();
  });

  it('copes with a series that has no reviews at all', () => {
    const empty = {
      ...trend,
      daily: trend.daily.map((d) => ({ ...d, reviews: 0, correct: 0, accuracy: null })),
    };
    render(<AccuracyTrend trend={empty} />);
    expect(screen.getByRole('status')).toHaveTextContent('Last 30 days: no reviews');
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
