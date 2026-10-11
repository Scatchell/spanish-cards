import { useState } from 'react';

const LONG_RATIONALE_CHARS = 120;

// Long text is clamped and toggled by default; the wide table opts out in CSS.
export function RationaleToggle({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > LONG_RATIONALE_CHARS;
  return (
    <>
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
    </>
  );
}
