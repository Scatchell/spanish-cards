import type { CategoryMistake } from '../api.js';

export function PracticeTargetPills({ targets }: { targets: CategoryMistake['practiceTargets'] }) {
  return (
    <>
      {targets.map((target, i) => (
        <span key={i} className="practice-target-pill">
          {target.submitted ?? '(nothing entered)'} &rarr; {target.expected}
        </span>
      ))}
    </>
  );
}
