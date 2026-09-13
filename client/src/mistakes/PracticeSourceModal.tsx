import { useEffect } from 'react';
import type { PracticeSessionDto } from '../api.js';

interface PracticeSourceModalProps {
  session: PracticeSessionDto;
  regenerating: boolean;
  onRegenerate: () => void;
  onClose: () => void;
}

export function PracticeSourceModal({ session, regenerating, onRegenerate, onClose }: PracticeSourceModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="practice-modal" role="dialog" aria-modal aria-label="Mistakes used for these practice sentences">
        <div className="practice-modal-header">
          <h2>Mistakes used for these practice sentences</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="practice-modal-body">
          <section className="practice-examples">
            <ul className="practice-example-list">
              {session.examples.map((example, i) => (
                <li key={i} className="practice-example">
                  <span className="practice-example-spanish">{example.spanishText ?? example.correctText}</span>
                  <span className="practice-example-english">
                    {example.englishText ?? '(original card no longer available)'}
                  </span>
                  <span className="practice-example-submitted hint">
                    Submitted: {example.submittedText || '(nothing entered)'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="hint">
              Generated {new Date(session.generatedAt).toLocaleString()} · {session.model}
            </p>
            <button type="button" className="secondary" onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
