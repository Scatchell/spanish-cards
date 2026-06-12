import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchExplanation } from '../api.js';

interface Props {
  cardId: number;
  spanishText: string;
  englishText: string;
  onClose: () => void;
}

type State = 'loading' | 'ready' | 'error';

export function ExplanationModal({ cardId, spanishText, englishText, onClose }: Props) {
  const [state, setState] = useState<State>('loading');
  const [markdown, setMarkdown] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchExplanation(cardId, controller.signal)
      .then(({ explanation }) => {
        setMarkdown(explanation.contentMarkdown);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, [cardId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="explanation-modal" role="dialog" aria-modal aria-label={`Explanation for ${spanishText}`}>
        <div className="explanation-modal-header">
          <div>
            <p className="explanation-spanish">{spanishText}</p>
            <p className="explanation-english">{englishText}</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="explanation-modal-body">
          {state === 'loading' && (
            <p className="hint explanation-loading">Generating explanation…</p>
          )}
          {state === 'ready' && <ReactMarkdown>{markdown}</ReactMarkdown>}
          {state === 'error' && (
            <p className="form-error" role="alert">
              Sorry! Something went wrong with this explanation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
