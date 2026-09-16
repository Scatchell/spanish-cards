import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FlipCard } from '../cards/FlipCard.js';
import type { AlternateAnswerData } from '../cards/EditableAnswerGroup.js';
import type { Direction } from '../training/direction.js';
import type { LearningSession } from './session.js';
import { currentCard } from './session.js';

interface LearningSessionViewProps {
  session: LearningSession;
  direction: Direction;
  onToggleDirection: () => void;
  onRemembered: () => void;
  onStillLearning: () => void;
  onSavePrompt?: (newText: string) => Promise<void>;
  onSaveAnswer?: (newText: string) => Promise<void>;
  onAddAlternate?: (text: string) => Promise<AlternateAnswerData>;
  onUpdateAlternate?: (id: number, text: string) => Promise<void>;
  onDeleteAlternate?: (id: number) => Promise<void>;
  editable?: boolean;
  onKeepLearning: () => void;
  // Omit to hide the "Choose different cards" option on the pass-complete
  // screen — it doesn't make sense for a session built from a fixed set.
  onChooseDifferentCards?: () => void;
  // Rendered below the active card and the pass-complete screen alike.
  footer?: ReactNode;
}

export function LearningSessionView({
  session,
  direction,
  onToggleDirection,
  onRemembered,
  onStillLearning,
  onSavePrompt,
  onSaveAnswer,
  onAddAlternate,
  onUpdateAlternate,
  onDeleteAlternate,
  editable = true,
  onKeepLearning,
  onChooseDifferentCards,
  footer,
}: LearningSessionViewProps) {
  const card = currentCard(session);

  return (
    <>
      {card && (
        <section className="train-card" aria-label="Learning card">
          <div className="train-meta">
            <span className="queue-count">
              Remembered {session.rememberedIds.length} of {session.selected.length}
            </span>
            <button type="button" className="secondary direction-toggle" onClick={onToggleDirection}>
              {direction === 'spanish-to-english' ? 'Spanish → English' : 'English → Spanish'}
            </button>
          </div>

          <FlipCard
            card={card}
            direction={direction}
            onRemembered={onRemembered}
            onStillLearning={onStillLearning}
            onSavePrompt={onSavePrompt}
            onSaveAnswer={onSaveAnswer}
            onAddAlternate={onAddAlternate}
            onUpdateAlternate={onUpdateAlternate}
            onDeleteAlternate={onDeleteAlternate}
            editable={editable}
          />
        </section>
      )}

      {!card && (
        <section className="train-done" aria-label="Learning pass complete">
          <h2>Pass complete! 🎉</h2>
          <p>
            You remembered all {session.selected.length} card
            {session.selected.length === 1 ? '' : 's'} in this pass.
          </p>
          <button type="button" onClick={onKeepLearning}>
            Keep learning these cards
          </button>
          <Link to="/train" className="train-link">
            Start training
          </Link>
          {onChooseDifferentCards && (
            <button type="button" className="secondary" onClick={onChooseDifferentCards}>
              Choose different cards
            </button>
          )}
        </section>
      )}

      {footer}
    </>
  );
}
