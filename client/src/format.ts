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

// 'YYYY-MM-DD' -> "Jun 10". Built from UTC parts so the calendar date is never
// shifted by the browser's timezone.
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// ISO instant -> "Jun 10" in the browser's locale and timezone.
export function formatShortInstant(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const formatLastStudied = (iso: string | null): string => (iso === null ? 'Never' : formatShortInstant(iso));
