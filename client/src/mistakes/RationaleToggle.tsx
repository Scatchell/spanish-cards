import { useState } from 'react';

const LONG_RATIONALE_CHARS = 120;

// The clamp and the toggle's visibility are CSS-driven (`.is-clamped`,
// `.mistake-rationale-toggle`), so each surface decides where collapsing applies.
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
