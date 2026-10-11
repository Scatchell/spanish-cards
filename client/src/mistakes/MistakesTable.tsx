import { Link } from 'react-router-dom';
import type { CategoryMistake } from '../api.js';
import { formatShortInstant } from '../format.js';
import { PracticeTargetPills } from './PracticeTargetPills.js';
import { RationaleToggle } from './RationaleToggle.js';

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
      <td role="cell" className="mistake-rationale" data-label="Rationale">
        <RationaleToggle text={item.rationale} />
      </td>
      <td
        role="cell"
        className={hasTargets ? 'mistake-targets' : 'mistake-targets mistake-targets-empty'}
        data-label={hasTargets ? 'Practice targets' : undefined}
      >
        <PracticeTargetPills targets={item.practiceTargets} />
      </td>
      <td role="cell" className="mistake-practice">
        <Link to={`/mistakes/${item.id}/practice`} className="secondary">
          Practice this mistake
        </Link>
      </td>
      <td role="cell" className="mistake-when">
        {formatShortInstant(item.createdAt)}
      </td>
    </tr>
  );
}
