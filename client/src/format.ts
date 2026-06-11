// Small display formatters shared by the cards and progress pages.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Compact "when is this card next due" label.
export function formatDueStatus(dueIso: string, now: Date): string {
  const diff = new Date(dueIso).getTime() - now.getTime();
  if (diff <= 0) {
    return 'Due now';
  }
  if (diff < HOUR_MS) {
    return `Due in ${Math.ceil(diff / MINUTE_MS)}m`;
  }
  if (diff < DAY_MS) {
    return `Due in ${Math.ceil(diff / HOUR_MS)}h`;
  }
  return `Due in ${Math.ceil(diff / DAY_MS)}d`;
}

// 0..1 fraction as a whole percentage, or a placeholder when there is no
// data to rate yet.
export function formatPercent(rate: number | null): string {
  if (rate === null) {
    return '—';
  }
  return `${Math.round(rate * 100)}%`;
}
