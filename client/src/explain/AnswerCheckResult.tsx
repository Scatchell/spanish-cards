import ReactMarkdown from 'react-markdown';
import type { AnswerCheckResponse } from '../api.js';
import { isDuplicateAnswer } from '../training/answer-check.js';

type AnswerCheck = AnswerCheckResponse['answerCheck'];

interface Props {
  answerCheck: AnswerCheck;
  spanishText: string;
  englishText: string;
  direction: 'spanish-to-english' | 'english-to-spanish';
  // The card's primary + alternate answers for this direction.
  existingAnswers: string[];
  onAdopt: (suggested: string) => void;
}

function ComparisonRow({
  label,
  text,
  translation,
  variant,
}: {
  label: string;
  text: string;
  translation: string;
  variant: 'yours' | 'correct';
}) {
  return (
    <div className={`answer-compare-row answer-compare-${variant}`}>
      <p className="answer-compare-label">{label}</p>
      <p className="answer-compare-text">{text}</p>
      <p className="answer-compare-translation">{translation}</p>
    </div>
  );
}

export function AnswerCheckResult({
  answerCheck,
  spanishText,
  englishText,
  direction,
  existingAnswers,
  onAdopt,
}: Props) {
  // The learner typed the answer side; the correct phrase and its translation
  // are the two sides of the card, so no LLM output is needed for them.
  const correctText = direction === 'spanish-to-english' ? englishText : spanishText;
  const correctTranslation = direction === 'spanish-to-english' ? spanishText : englishText;
  const { suggestedAnswer, submittedReading } = answerCheck;

  return (
    <div className="answer-check-result">
      <ul className="answer-check-points">
        {answerCheck.feedbackPoints.map((point, index) => (
          <li key={index}>
            <ReactMarkdown allowedElements={['p', 'em', 'strong', 'code']} unwrapDisallowed>
              {point}
            </ReactMarkdown>
          </li>
        ))}
      </ul>
      <div className="answer-compare">
        {submittedReading && (
          <ComparisonRow
            label="Your answer"
            text={submittedReading.text}
            translation={submittedReading.translation}
            variant="yours"
          />
        )}
        <ComparisonRow
          label="Correct answer"
          text={correctText}
          translation={correctTranslation}
          variant="correct"
        />
      </div>
      {answerCheck.verdict === 'valid' && suggestedAnswer && (
        <div className="answer-check-adopt">
          {isDuplicateAnswer(suggestedAnswer, existingAnswers) ? (
            <p className="answer-check-adopt-lead">
              Your answer works — it already matches a saved answer.
            </p>
          ) : (
            <>
              <p className="answer-check-adopt-lead">
                Your answer works — save it as an alternative:
              </p>
              <p className="answer-check-suggested">{suggestedAnswer}</p>
              <button
                type="button"
                className="answer-check-adopt-button"
                onClick={() => onAdopt(suggestedAnswer)}
              >
                Add as alternative
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
