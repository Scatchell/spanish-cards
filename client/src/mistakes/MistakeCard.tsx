import { Link } from 'react-router-dom';
import type { CategoryMistake } from '../api.js';
import { formatMistakeDate } from '../format.js';
import { CATEGORY_INFO } from './categoryInfo.js';
import { RationaleToggle } from './RationaleToggle.js';

export function MistakeCard({ item }: { item: CategoryMistake }) {
  const categoryLabel = CATEGORY_INFO.find((info) => info.category === item.category)?.label ?? item.category;
  return (
    <article className="mistake-card">
      <header className="mistake-card-head">
        <span className="mistake-card-category">{categoryLabel}</span>
        <time dateTime={item.createdAt}>{formatMistakeDate(item.createdAt)}</time>
      </header>
      <div className="mistake-card-field">
        <span className="mistake-card-label">Correct</span>
        <span className="mistake-card-correct">{item.correctText}</span>
      </div>
      <div className="mistake-card-field">
        <span className="mistake-card-label">Submitted</span>
        <span className="mistake-card-submitted">{item.submittedText}</span>
      </div>
      <div className="mistake-card-rationale">
        <span className="mistake-card-label">Rationale</span>
        <RationaleToggle text={item.rationale} />
      </div>
      {item.practiceTargets.length > 0 && (
        <div className="mistake-card-field">
          <span className="mistake-card-label">Practice targets</span>
          <span>
            {item.practiceTargets.map((target, i) => (
              <span key={i} className="practice-target-pill">
                {target.submitted ?? '(nothing entered)'} &rarr; {target.expected}
              </span>
            ))}
          </span>
        </div>
      )}
      <Link to={`/mistakes/${item.id}/practice`} className="mistake-card-practice">
        Practice this mistake
      </Link>
    </article>
  );
}
