import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CategoryMistake } from '../api.js';

const LONG_RATIONALE_CHARS = 120;

function formatMistakeDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Explicit roles because the narrow-screen CSS sets display: grid on rows, which
// makes some screen readers drop the table semantics.
export function MistakesTable({ items }: { items: CategoryMistake[] }) {
  return (
    <table className="mistakes-table" role="table">
      <thead role="rowgroup">
        <tr role="row">
          <th role="columnheader">Correct</th>
          <th role="columnheader">Submitted</th>
          <th role="columnheader">Rationale</th>
          <th role="columnheader">Practice targets</th>
          <th role="columnheader">Practice</th>
          <th role="columnheader">When</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {items.map((item) => (
          <MistakeRow key={item.id} item={item} />
        ))}
      </tbody>
    </table>
  );
}

function MistakeRow({ item }: { item: CategoryMistake }) {
  const hasTargets = item.practiceTargets.length > 0;
  return (
    <tr role="row">
      <td role="cell" className="mistake-correct" data-label="Correct">
        {item.correctText}
      </td>
      <td role="cell" className="mistake-submitted" data-label="Submitted">
        {item.submittedText}
      </td>
      <RationaleCell text={item.rationale} />
      <td
        role="cell"
        className={hasTargets ? 'mistake-targets' : 'mistake-targets mistake-targets-empty'}
        data-label={hasTargets ? 'Practice targets' : undefined}
      >
        {item.practiceTargets.map((target, i) => (
          <span key={i} className="practice-target-pill">
            {target.submitted ?? '(nothing entered)'} &rarr; {target.expected}
          </span>
        ))}
      </td>
      <td role="cell" className="mistake-practice">
        <Link to={`/mistakes/${item.id}/practice`} className="secondary">
          Practice this mistake
        </Link>
      </td>
      <td role="cell" className="mistake-when">
        {formatMistakeDate(item.createdAt)}
      </td>
    </tr>
  );
}

function RationaleCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > LONG_RATIONALE_CHARS;
  return (
    <td role="cell" className="mistake-rationale" data-label="Rationale">
      <span className={long && !expanded ? 'mistake-rationale-text is-clamped' : 'mistake-rationale-text'}>
        {text}
      </span>
      {long && (
        <button
          type="button"
          className="mistake-rationale-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </td>
  );
}
