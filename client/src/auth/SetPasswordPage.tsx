import { useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, checkSetPasswordToken, setPassword } from '../api.js';

type LinkState = { status: 'checking' } | { status: 'invalid' } | { status: 'ready'; email: string };

export function SetPasswordPage({ onLogin }: { onLogin: () => void }) {
  const [params] = useSearchParams();
  const tokenRef = useRef(params.get('token') ?? '');
  const token = tokenRef.current;
  const navigate = useNavigate();
  const [link, setLink] = useState<LinkState>({ status: 'checking' });
  const [password, setPasswordValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Drop the token from the URL bar once read, so it doesn't linger in
    // browser history or get shared accidentally (e.g. via screenshot/copy).
    if (token) window.history.replaceState(null, '', '/set-password');
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLink({ status: 'invalid' });
      return;
    }
    checkSetPasswordToken(token)
      .then(({ email }) => setLink({ status: 'ready', email }))
      .catch(() => setLink({ status: 'invalid' }));
  }, [token]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setPassword(token, password);
      onLogin();
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setLink({ status: 'invalid' });
      else setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  }

  if (link.status === 'checking') {
    return <main className="centered-page">Checking link…</main>;
  }
  if (link.status === 'invalid') {
    return (
      <main className="centered-page">
        <div className="login-form">
          <h1>Spanish Cards</h1>
          <p>This link is invalid or has expired — ask for a new one.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="centered-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>Spanish Cards</h1>
        <p>Set a password for {link.email}</p>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
            autoComplete="new-password"
            autoFocus
            minLength={8}
            maxLength={256}
            required
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </main>
  );
}
