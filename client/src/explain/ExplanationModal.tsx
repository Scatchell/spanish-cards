import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { askFollowUp, checkSubmittedAnswer, fetchExplanation } from '../api.js';
import type { AnswerCheckResponse } from '../api.js';
import type { Verdict } from '../training/answer-check.js';

interface Props {
  cardId: number;
  spanishText: string;
  englishText: string;
  onClose: () => void;
  // Present only when opened after a typed Train check:
  submittedAnswer?: string;
  direction?: 'spanish-to-english' | 'english-to-spanish';
  verdict?: Verdict;
  // Adopts the suggested wording (closes the modal + pre-fills the inline edit):
  onAdoptAnswer?: (suggested: string) => void;
}

type State = 'loading' | 'ready' | 'error';
type FollowUpState = 'idle' | 'asking' | 'error';
type AnswerCheckState = 'idle' | 'loading' | 'ready' | 'error';

export function ExplanationModal({
  cardId,
  spanishText,
  englishText,
  onClose,
  submittedAnswer,
  direction,
  verdict,
  onAdoptAnswer,
}: Props) {
  const [state, setState] = useState<State>('loading');
  const [markdown, setMarkdown] = useState('');

  const [question, setQuestion] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [answerMarkdown, setAnswerMarkdown] = useState('');
  const [followUpState, setFollowUpState] = useState<FollowUpState>('idle');
  const followUpAbortRef = useRef<AbortController | null>(null);

  // "Explain more": an LLM check of the learner's actual submitted answer. Only
  // meaningful for an `incorrect` typed submission from the Train flow, so it is
  // absent whenever the modal is opened without those props (Learn / retry).
  const canExplainMore =
    verdict === 'incorrect' &&
    submittedAnswer !== undefined &&
    direction !== undefined &&
    onAdoptAnswer !== undefined;
  const [answerCheckState, setAnswerCheckState] = useState<AnswerCheckState>('idle');
  const [answerCheck, setAnswerCheck] = useState<AnswerCheckResponse['answerCheck'] | null>(null);
  const answerCheckAbortRef = useRef<AbortController | null>(null);

  function runAnswerCheck() {
    if (!canExplainMore) return;
    if (answerCheckState !== 'idle' && answerCheckState !== 'error') return;

    answerCheckAbortRef.current?.abort();
    const controller = new AbortController();
    answerCheckAbortRef.current = controller;

    setAnswerCheckState('loading');
    checkSubmittedAnswer(cardId, submittedAnswer!, direction!, controller.signal)
      .then(({ answerCheck: result }) => {
        setAnswerCheck(result);
        setAnswerCheckState('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setAnswerCheckState('error');
      });
  }

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
      answerCheckAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      // Pressing the Explain shortcut again while the modal is open runs the
      // answer check — but never while typing in the follow-up input.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.code === 'KeyE' && canExplainMore) {
        event.preventDefault();
        runAnswerCheck();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [onClose, canExplainMore, answerCheckState]);

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
          {canExplainMore && (
            <div className="answer-check">
              {answerCheckState === 'idle' && (
                <button
                  type="button"
                  className="explain-button answer-check-trigger"
                  aria-label="Explain more"
                  onClick={runAnswerCheck}
                >
                  Explain more <span className="shortcut-hint">(E)</span>
                </button>
              )}
              {answerCheckState === 'loading' && (
                <p className="hint answer-check-loading">Checking your answer…</p>
              )}
              {answerCheckState === 'error' && (
                <>
                  <p className="form-error" role="alert">
                    Sorry! Couldn't check that answer — try again.
                  </p>
                  <button
                    type="button"
                    className="secondary answer-check-retry"
                    onClick={runAnswerCheck}
                  >
                    Retry
                  </button>
                </>
              )}
              {answerCheckState === 'ready' && answerCheck && (
                <div className="answer-check-result">
                  <ReactMarkdown>{answerCheck.critiqueMarkdown}</ReactMarkdown>
                  {answerCheck.verdict === 'valid' && answerCheck.suggestedAnswer && (
                    <div className="answer-check-adopt">
                      <p className="answer-check-adopt-lead">
                        Your answer works — here's a cleaner version to store:
                      </p>
                      <p className="answer-check-suggested">{answerCheck.suggestedAnswer}</p>
                      <button
                        type="button"
                        className="answer-check-adopt-button"
                        onClick={() => onAdoptAnswer!(answerCheck.suggestedAnswer!)}
                      >
                        Adopt
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
