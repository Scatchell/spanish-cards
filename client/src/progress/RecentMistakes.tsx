import { Link } from 'react-router-dom';
import type { CategoryMistake } from '../api.js';
import { MistakeCard } from '../mistakes/MistakeCard.js';

export function RecentMistakes({ items }: { items: CategoryMistake[] }) {
  return (
    <section aria-label="Recent mistakes" className="recent-mistakes">
      <h2>Recent mistakes</h2>
      {items.length === 0 ? (
        <p className="hint">
          No mistakes recorded yet. Mistakes you make while training show up here so you can practice them.
        </p>
      ) : (
        <>
          <ul className="mistake-card-list">
            {items.map((item) => (
              <li key={item.id}>
                <MistakeCard item={item} />
              </li>
            ))}
          </ul>
          <Link to="/mistakes" className="recent-mistakes-all">
            See all mistakes
          </Link>
        </>
      )}
    </section>
  );
}
