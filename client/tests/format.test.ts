import { describe, expect, it } from 'vitest';
import { formatDueStatus, formatPercent } from '../src/format.js';

const NOW = new Date('2026-06-10T12:00:00Z');

describe('formatDueStatus', () => {
  it('shows "Due now" for past and present due times', () => {
    expect(formatDueStatus('2026-06-10T12:00:00Z', NOW)).toBe('Due now');
    expect(formatDueStatus('2026-06-01T00:00:00Z', NOW)).toBe('Due now');
  });

  it('shows minutes under an hour, rounding up', () => {
    expect(formatDueStatus('2026-06-10T12:00:01Z', NOW)).toBe('Due in 1m');
    expect(formatDueStatus('2026-06-10T12:59:00Z', NOW)).toBe('Due in 59m');
  });

  it('shows hours under a day', () => {
    expect(formatDueStatus('2026-06-10T13:30:00Z', NOW)).toBe('Due in 2h');
    expect(formatDueStatus('2026-06-11T11:00:00Z', NOW)).toBe('Due in 23h');
  });

  it('shows days from a day onward', () => {
    expect(formatDueStatus('2026-06-11T12:00:01Z', NOW)).toBe('Due in 2d');
    expect(formatDueStatus('2026-07-10T12:00:00Z', NOW)).toBe('Due in 30d');
  });
});

describe('formatPercent', () => {
  it('rounds fractions to whole percentages', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(2 / 3)).toBe('67%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('shows a placeholder when there is no data', () => {
    expect(formatPercent(null)).toBe('—');
  });
});
