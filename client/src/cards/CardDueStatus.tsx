import type { Card } from '../api.js';
import { formatDueStatus } from '../format.js';

// Due/learning status line for a saved card. A card that has never been
// reviewed is "New" (always due now); reviewed cards show when they are next
// due, highlighted when due now.
export function CardDueStatus({ card }: { card: Card }) {
  const status = formatDueStatus(card.due, new Date());
  const dueNow = status === 'Due now';
  return (
    <span className={dueNow ? 'due-status due-now' : 'due-status'}>
      {card.reviewed ? status : 'New · due now'}
    </span>
  );
}
