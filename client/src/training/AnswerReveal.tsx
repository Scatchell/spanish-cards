import type { AnswerCheckResult } from './answer-check.js';

interface AnswerRevealProps {
  submitted: string;
  result: AnswerCheckResult;
}

export function AnswerReveal({ submitted, result }: AnswerRevealProps) {
  const submittedTrimmed = submitted.trim();
  const { verdict, correctSegments } = result;
  const correctText = correctSegments
    .filter((s) => s.kind !== 'extra')
    .map((s) => s.text)
    .join('')
    .replace(/  +/g, ' ');
  const showDiff = verdict !== 'correct' && submittedTrimmed !== '';

  return (
    <div className="answer-reveal" data-verdict={verdict}>
      {verdict === 'correct' && <p className="verdict success">Correct!</p>}
      {verdict === 'correctWithDifferences' && (
        <p className="verdict success">Correct &mdash; but check the highlighted details</p>
      )}
      {verdict === 'incorrect' && (
        <p className="verdict failure">
          {submittedTrimmed === '' ? 'The answer was:' : 'Not quite'}
        </p>
      )}

      {verdict !== 'correct' && submittedTrimmed !== '' && (
        <p className="submitted-answer">
          You typed: <span>{submittedTrimmed}</span>
        </p>
      )}

      <p className="correct-answer" aria-label="Correct answer">{correctText}</p>

      {showDiff && (
        <p className="answer-diff">
          {correctSegments.map((segment, i) => {
            if (segment.kind === 'unchanged') return <span key={i}>{segment.text}</span>;
            const className = segment.kind === 'extra' ? 'extra' : undefined;
            return <mark key={i} className={className}>{segment.text}</mark>;
          })}
        </p>
      )}

      {verdict === 'incorrect' && submittedTrimmed !== '' && (
        <p className="hint">
          Remembered it anyway? Rate it Hard, Good, or Easy instead of &ldquo;Don&rsquo;t remember&rdquo;.
        </p>
      )}
    </div>
  );
}
