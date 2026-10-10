import { Link } from 'react-router-dom';
import type { PeriodTotals, ProgressDeck } from '../api.js';
import { Stat } from './Stat.js';

type Bucket = 'mastered' | 'familiar' | 'learning' | 'lapsed' | 'new';

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'mastered', label: 'Mastered' },
  { key: 'familiar', label: 'Familiar' },
  { key: 'learning', label: 'Learning' },
  { key: 'lapsed', label: 'Lapsed' },
  { key: 'new', label: 'New' },
];

export function DeckSection({ deck, thisWeek }: { deck: ProgressDeck; thisWeek: PeriodTotals }) {
  const composition = BUCKETS.map(({ key }) => `${deck[key]} ${key}`).join(', ');
  return (
    <section aria-label="Deck overview" className="deck-section">
      <h2>Deck</h2>
      <p className="deck-total">{deck.total === 1 ? '1 card' : `${deck.total} cards`}</p>

      {deck.total === 0 ? (
        <p className="hint">
          Nothing here yet. <Link to="/">Add some cards</Link> to start building your deck.
        </p>
      ) : (
        <div className="deck-bar" role="img" aria-label={`Deck: ${composition}`}>
          {BUCKETS.filter(({ key }) => deck[key] > 0).map(({ key }) => (
            <span key={key} className={`deck-segment deck-${key}`} style={{ flexGrow: deck[key] }} />
          ))}
        </div>
      )}

      <dl className="stats-grid deck-legend">
        {BUCKETS.map(({ key, label }) => (
          <Stat key={key} label={label} value={deck[key]} />
        ))}
      </dl>
      <p className="hint deck-explainer">
        Mastered: you would likely still remember it in {deck.masteredThresholdDays} days. Familiar: you know it, but
        it is not that solid yet. Lapsed: you forgot it and are relearning it.
      </p>

      <dl className="stats-grid">
        <Stat label="Due now" value={deck.dueNow} emphasized={deck.dueNow > 0} />
        <Stat label="Added this week" value={thisWeek.cardsAdded} />
        <Stat label="Reviewed this week" value={thisWeek.reviews} />
      </dl>
    </section>
  );
}
