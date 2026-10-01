import { useEffect, useState } from 'react';
import type { SubmitEvent } from 'react';
import { ApiError, changePassword, getMe, logout } from '../api.js';
import { HeaderMenu } from '../nav/HeaderMenu.js';
import {
  CardsLink,
  HeaderSeparator,
  LogoutButton,
} from '../nav/HeaderItems.js';

export function AccountPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getMe()
      .then((me) => setEmail(me.email))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onLoggedOut();
      });
  }, [onLoggedOut]);

  async function handleLogout() {
    await logout().catch(() => undefined);
    onLoggedOut();
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onLoggedOut();
      else setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Account</h1>
        <HeaderMenu>
          <CardsLink />
          <HeaderSeparator />
          <LogoutButton onClick={handleLogout} />
        </HeaderMenu>
      </header>
      <main>
        <p>
          Signed in as <strong>{email ?? '…'}</strong>
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Change password</h2>
          <label>
            Current password
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {saved && <p role="status">Password changed. Other devices have been signed out.</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </main>
    </div>
  );
}
