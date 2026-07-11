import { useEffect, useState } from 'react';
import { canExplain } from '../explain/canExplain.js';
import { ExplainButton } from '../explain/ExplainButton.js';
import { ExplanationModal } from '../explain/ExplanationModal.js';
import type { Direction } from '../training/direction.js';
import { answerText, promptText } from '../training/direction.js';
import { EditableSentence } from './EditableSentence.js';

const DIGIT_BY_CODE: Record<string, string> = {
  Digit1: '1',
  Numpad1: '1',
  Digit2: '2',
  Numpad2: '2',
};

const noop = () => Promise.resolve();

interface FlipCardCard {
  id: number;
  spanishText: string;
  englishText: string;
  languagePair: string;
  due: string;
}

interface FlipCardProps {
  card: FlipCardCard;
  direction: Direction;
  onRemembered: () => void;
  onStillLearning: () => void;
  onSavePrompt?: (newText: string) => Promise<void>;
  onSaveAnswer?: (newText: string) => Promise<void>;
  rememberedLabel?: string;
  stillLearningLabel?: string;
}

export function FlipCard({
  card,
  direction,
  onRemembered,
  onStillLearning,
  onSavePrompt,
  onSaveAnswer,
  rememberedLabel = 'Remembered',
  stillLearningLabel = 'Still learning',
}: FlipCardProps) {
  const [showBack, setShowBack] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);

  useEffect(() => {
    setShowBack(false);
    setExplainOpen(false);
  }, [card.id, direction]);

  const promptLabel = direction === 'spanish-to-english' ? 'Spanish prompt' : 'English prompt';
  const answerLabel = direction === 'spanish-to-english' ? 'English answer' : 'Spanish answer';

  useEffect(() => {
    if (explainOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setShowBack((s) => !s);
        return;
      }
      if (event.code === 'KeyE' && showBack && canExplain(card)) {
        event.preventDefault();
        setExplainOpen(true);
        return;
      }
      const digit = /^[12]$/.test(event.key) ? event.key : DIGIT_BY_CODE[event.code];
      if (digit === '1') {
        event.preventDefault();
        onRemembered();
      } else if (digit === '2') {
        event.preventDefault();
        onStillLearning();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [explainOpen, showBack, card, onRemembered, onStillLearning]);

  return (
    <>
      <EditableSentence
        className="train-prompt"
        text={promptText(card, direction)}
        ariaLabel={promptLabel}
        sentenceAriaLabel="Prompt"
        onSave={onSavePrompt ?? noop}
      />

      <p
        className={showBack ? 'learn-answer-row' : 'learn-answer-row concealed'}
        aria-label="Answer"
        aria-hidden={!showBack}
      >
        <EditableSentence
          className="learn-answer"
          text={answerText(card, direction)}
          ariaLabel={answerLabel}
          onSave={onSaveAnswer ?? noop}
        />
      </p>
      <div className="learn-show-answer-row">
        <button type="button" className="secondary" onClick={() => setShowBack((s) => !s)}>
          {showBack ? 'Hide answer' : 'Show answer'}{' '}
          <span className="shortcut-hint">(Space)</span>
        </button>
        {canExplain(card) && (
          <ExplainButton onClick={() => setExplainOpen(true)} concealed={!showBack} />
        )}
      </div>

      {explainOpen && (
        <ExplanationModal
          cardId={card.id}
          spanishText={card.spanishText}
          englishText={card.englishText}
          onClose={() => setExplainOpen(false)}
        />
      )}

      <div className="learn-actions">
        <button type="button" onClick={onRemembered}>
          {rememberedLabel} <span className="shortcut-hint">(1)</span>
        </button>
        <button type="button" className="secondary" onClick={onStillLearning}>
          {stillLearningLabel} <span className="shortcut-hint">(2)</span>
        </button>
      </div>
    </>
  );
}
