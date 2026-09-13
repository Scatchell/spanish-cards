import { useEffect, useState } from 'react';
import { ApiError, fetchPracticeSession, generatePracticeSession } from '../api.js';
import type { CategoryMistake, PracticeSessionDto } from '../api.js';

type State = 'loading' | 'ready' | 'unavailable' | 'error';

export function PracticeModal({ mistake, onClose }: { mistake: CategoryMistake; onClose: () => void }) {
  const [state, setState] = useState<State>('loading');
  const [session, setSession] = useState<PracticeSessionDto | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchPracticeSession(mistake.id)
      .then((existing) => (existing ? existing : generatePracticeSession(mistake.id)))
      .then((loaded) => {
        if (cancelled) return;
        setSession(loaded);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 503 ? 'unavailable' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [mistake.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleRegenerate() {
    setRegenerating(true);
    generatePracticeSession(mistake.id)
      .then((regenerated) => {
        setSession(regenerated);
        setRegenerating(false);
      })
      .catch(() => {
        setRegenerating(false);
        setState('error');
      });
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="practice-modal" role="dialog" aria-modal aria-label="Practice this mistake">
        <div className="practice-modal-header">
          <div>
            <p className="explanation-spanish">{mistake.correctText}</p>
            <p className="explanation-english">{mistake.submittedText}</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="practice-modal-body">
          {state === 'loading' && (
            <p className="hint">Gathering examples and generating practice sentences…</p>
          )}
          {state === 'unavailable' && (
            <p className="form-error" role="alert">
              Practice sentence generation isn't configured.
            </p>
          )}
          {state === 'error' && (
            <p className="form-error" role="alert">
              Something went wrong generating practice sentences.
            </p>
          )}
          {state === 'ready' && session && (
            <>
              <section className="practice-examples">
                <button
                  type="button"
                  className="secondary practice-examples-toggle"
                  onClick={() => setExamplesOpen((v) => !v)}
                >
                  {examplesOpen ? 'Hide' : 'Show'} historical examples ({session.examples.length})
                </button>
                {examplesOpen && (
                  <ul className="practice-example-list">
                    {session.examples.map((example, i) => (
                      <li key={i} className="practice-example">
                        <span className="practice-example-spanish">
                          {example.spanishText ?? example.correctText}
                        </span>
                        <span className="practice-example-english">
                          {example.englishText ?? '(original card no longer available)'}
                        </span>
                        <span className="practice-example-submitted hint">
                          Submitted: {example.submittedText || '(nothing entered)'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="practice-sentences">
                <h3>Practice sentences</h3>
                <ul className="practice-sentence-list">
                  {session.sentences.map((sentence, i) => (
                    <li key={i} className="practice-sentence">
                      <span className="practice-sentence-spanish">{sentence.spanish}</span>
                      <span className="practice-sentence-english">{sentence.english}</span>
                    </li>
                  ))}
                </ul>
                <p className="hint">
                  Generated {new Date(session.generatedAt).toLocaleString()} · {session.model}
                </p>
                <button type="button" className="secondary" onClick={handleRegenerate} disabled={regenerating}>
                  {regenerating ? 'Regenerating…' : 'Regenerate'}
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
