import { EditableAnswerGroup } from '../cards/EditableAnswerGroup.js';
import type { AlternateAnswerData } from '../cards/EditableAnswerGroup.js';
import type { AlternateAwareResult } from './answer-check.js';

interface AnswerRevealProps {
  submitted: string;
  result: AlternateAwareResult;
  // The card's primary answer for this direction — used to detect whether
  // the verdict matched the primary or fell back to an alternate.
  primaryText: string;
  alternates?: AlternateAnswerData[];
  onSavePrimary?: (newText: string) => Promise<void>;
  onAddAlternate?: (text: string) => Promise<AlternateAnswerData>;
  onUpdateAlternate?: (id: number, text: string) => Promise<void>;
  onDeleteAlternate?: (id: number) => Promise<void>;
  // When provided, the correct answer becomes inline-editable. Once an edit
  // has been saved, `answerOverride` holds the corrected text and the diff is
  // suppressed (we show the plain corrected sentence instead).
  answerOverride?: string | null;
  answerAriaLabel?: string;
}

export function AnswerReveal({
  submitted,
  result,
  primaryText,
  alternates = [],
  onSavePrimary,
  onAddAlternate,
  onUpdateAlternate,
  onDeleteAlternate,
  answerOverride = null,
  answerAriaLabel,
}: AnswerRevealProps) {
  const submittedTrimmed = submitted.trim();
  const { verdict, correctSegments, matchedText } = result;
  const correctText = correctSegments
    .filter((s) => s.kind !== 'extra')
    .map((s) => s.text)
    .join('')
    .replace(/  +/g, ' ');
  // Editing the answer replaces the diffed view with the plain corrected text.
  const showDiff = verdict !== 'correct' && submittedTrimmed !== '' && answerOverride === null;
  const matchedAlternate = matchedText !== primaryText;

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

      {onSavePrimary && onAddAlternate && onUpdateAlternate && onDeleteAlternate ? (
        <EditableAnswerGroup
          className="correct-answer"
          primaryText={answerOverride ?? primaryText}
          onSavePrimary={onSavePrimary}
          alternates={alternates}
          onAddAlternate={onAddAlternate}
          onUpdateAlternate={onUpdateAlternate}
          onDeleteAlternate={onDeleteAlternate}
          ariaLabel={answerAriaLabel ?? 'correct answer'}
        />
      ) : (
        <p className="correct-answer" aria-label="Correct answer">{answerOverride ?? correctText}</p>
      )}

      {matchedAlternate && verdict !== 'incorrect' && (
        <p className="hint matched-alternate-hint">Matched an alternate answer</p>
      )}

      {showDiff && (
        <p className="answer-diff">
          {correctSegments.map((segment, i) => {
            if (segment.kind === 'unchanged') return <span key={i}>{segment.text}</span>;
            const className = segment.kind === 'extra' ? 'extra' : undefined;
            return <mark key={i} className={className}>{segment.text}</mark>;
          })}
        </p>
      )}
    </div>
  );
}
