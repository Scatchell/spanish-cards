import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { askFollowUp, fetchExplanation } from '../api.js';

interface Props {
  cardId: number;
  spanishText: string;
  englishText: string;
  onClose: () => void;
}

type State = 'loading' | 'ready' | 'error';
type FollowUpState = 'idle' | 'asking' | 'error';

export function ExplanationModal({ cardId, spanishText, englishText, onClose }: Props) {
  const [state, setState] = useState<State>('loading');
  const [markdown, setMarkdown] = useState('');

  const [question, setQuestion] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [answerMarkdown, setAnswerMarkdown] = useState('');
  const [followUpState, setFollowUpState] = useState<FollowUpState>('idle');
  const followUpAbortRef = useRef<AbortController | null>(null);

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
    return () => {
      followUpAbortRef.current?.abort();
    };
  }, []);

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

  function handleAsk(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    followUpAbortRef.current?.abort();
    const controller = new AbortController();
    followUpAbortRef.current = controller;

    setFollowUpState('asking');

    askFollowUp(cardId, trimmed, markdown, controller.signal)
      .then(({ answerMarkdown: answer }) => {
        setAskedQuestion(trimmed);
        setAnswerMarkdown(answer);
        setQuestion('');
        setFollowUpState('idle');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setFollowUpState('error');
      });
  }

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
          {state === 'ready' && (
            <div className="explanation-followup">
              {askedQuestion && (
                <div className="followup-answer" aria-live="polite">
                  <p className="followup-question">{askedQuestion}</p>
                  <hr className="followup-divider" />
                  <ReactMarkdown>{answerMarkdown}</ReactMarkdown>
                  {followUpState === 'asking' && (
                    <p className="hint followup-loading">Thinking…</p>
                  )}
                </div>
              )}
              {!askedQuestion && followUpState === 'asking' && (
                <p className="hint followup-loading">Thinking…</p>
              )}
              {followUpState === 'error' && (
                <p className="form-error" role="alert">
                  Sorry! Couldn't answer that one — try again.
                </p>
              )}
              <form className="followup-form" onSubmit={handleAsk}>
                <input
                  type="text"
                  className="followup-input"
                  placeholder="Ask a question about this sentence…"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label="Ask a question about this sentence"
                />
                <button type="submit" disabled={followUpState === 'asking' || !question.trim()}>
                  Ask
                </button>
              </form>
              <p className="hint followup-disclaimer">
                Each question is independent — conversation history isn't stored.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
