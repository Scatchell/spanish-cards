import type { AnswerCheckResult } from './answer-check.js';

interface AnswerRevealProps {
  submitted: string;
  result: AnswerCheckResult;
}

export function AnswerReveal({ submitted, result }: AnswerRevealProps) {
  const submittedTrimmed = submitted.trim();
  const { verdict, correctSegments } = result;

  return (
    <div className="answer-reveal" data-verdict={verdict}>
      {verdict === 'correct' && <p className="verdict success">Correct!</p>}
      {verdict === 'correctWithDifferences' && (
        <p className="verdict success">Correct — but check the highlighted details</p>
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

      <p className="correct-answer" aria-label="Correct answer">
        {correctSegments.map((segment, i) =>
          segment.highlight ? <mark key={i}>{segment.text}</mark> : <span key={i}>{segment.text}</span>,
        )}
      </p>

      {verdict === 'incorrect' && submittedTrimmed !== '' && (
        <p className="hint">
          Remembered it anyway? Rate it Hard, Good, or Easy instead of “Don't remember”.
        </p>
      )}
    </div>
  );
}
