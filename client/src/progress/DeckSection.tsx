import { useState } from 'react';
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

function explain(bucket: Bucket, masteredThresholdDays: number): string {
  switch (bucket) {
    case 'mastered':
      return `You would likely still remember these in ${masteredThresholdDays} days.`;
    case 'familiar':
      return 'You know these, but they are not that solid yet.';
    case 'learning':
      return 'You are still learning these. Keep reviewing them and they will settle.';
    case 'lapsed':
      return 'You forgot these and are relearning them.';
    case 'new':
      return 'You added these but have not reviewed them yet.';
  }
}

export function DeckSection({ deck, last7Days }: { deck: ProgressDeck; last7Days: PeriodTotals }) {
  const [selected, setSelected] = useState<Bucket | null>(null);
  const composition = BUCKETS.map(({ key }) => `${deck[key]} ${key}`).join(', ');
  const select = (key: Bucket) => setSelected((current) => (current === key ? null : key));

  return (
    <section aria-label="Deck overview" className="deck-section">
      <h2>Deck</h2>
      <p className="deck-total">{deck.total === 1 ? '1 card' : `${deck.total} cards`}</p>

      {deck.total === 0 ? (
        <p className="hint">
          Nothing here yet. <Link to="/">Add some cards</Link> to start building your deck.
        </p>
      ) : (
        <div
          className={selected ? 'deck-bar has-selection' : 'deck-bar'}
          role="img"
          aria-label={`Deck: ${composition}`}
        >
          {BUCKETS.filter(({ key }) => deck[key] > 0).map(({ key }) => (
            <span
              key={key}
              className={`deck-segment deck-${key}${key === selected ? ' is-selected' : ''}`}
              style={{ flexGrow: deck[key] }}
            />
          ))}
        </div>
      )}

      <div className="deck-legend" role="group" aria-label="Deck buckets">
        {BUCKETS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`stat-tile deck-legend-item deck-${key}`}
            aria-pressed={selected === key}
            onClick={() => select(key)}
          >
            <span className="deck-legend-label">{label}</span>
            <span className="deck-legend-count">{deck[key]}</span>
          </button>
        ))}
      </div>
      <p className={selected ? `deck-explainer deck-${selected}` : 'deck-explainer'} role="status">
        {selected ? explain(selected, deck.masteredThresholdDays) : 'Select a box to see what it means.'}
      </p>

      <dl className="stats-grid">
        <Stat label="Due now" value={deck.dueNow} emphasized={deck.dueNow > 0} />
        <Stat label="Added (7d)" value={last7Days.cardsAdded} />
        <Stat label="Reviewed (7d)" value={last7Days.reviews} />
      </dl>
    </section>
  );
}
