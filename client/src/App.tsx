import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getMe } from './api.js';
import { AccountPage } from './auth/AccountPage.js';
import { LoginPage } from './auth/LoginPage.js';
import { SetPasswordPage } from './auth/SetPasswordPage.js';
import { CardsPage } from './cards/CardsPage.js';
import { LearnPage } from './learning/LearnPage.js';
import { MistakesPage } from './mistakes/MistakesPage.js';
import { PracticeMistakePage } from './mistakes/PracticeMistakePage.js';
import { ProgressPage } from './progress/ProgressPage.js';
import { TrainPage } from './training/TrainPage.js';

type AuthState = 'loading' | 'authenticated' | 'anonymous';

export function App() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [userEmail, setUserEmail] = useState('');

  // Resolves the session; also used right after login so the email is known.
  const refreshSession = useCallback(() => {
    return getMe()
      .then(({ email }) => {
        setUserEmail(email);
        setAuth('authenticated');
      })
      .catch(() => setAuth('anonymous'));
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  if (auth === 'loading') {
    return <main className="centered-page">Loading…</main>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          auth === 'authenticated' ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onLogin={() => void refreshSession()} />
          )
        }
      />
      <Route
        path="/"
        element={
          auth === 'authenticated' ? (
            <CardsPage onLoggedOut={() => setAuth('anonymous')} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/learn"
        element={
          auth === 'authenticated' ? (
            <LearnPage onLoggedOut={() => setAuth('anonymous')} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/train"
        element={
          auth === 'authenticated' ? (
            <TrainPage onLoggedOut={() => setAuth('anonymous')} userEmail={userEmail} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/progress"
        element={
          auth === 'authenticated' ? (
            <ProgressPage onLoggedOut={() => setAuth('anonymous')} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/mistakes/:category?"
        element={
          auth === 'authenticated' ? (
            <MistakesPage onLoggedOut={() => setAuth('anonymous')} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/mistakes/:categorizationId/practice"
        element={
          auth === 'authenticated' ? (
            <PracticeMistakePage onLoggedOut={() => setAuth('anonymous')} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="/set-password" element={<SetPasswordPage onLogin={() => void refreshSession()} />} />
      <Route
        path="/account"
        element={
          auth === 'authenticated' ? (
            <AccountPage onLoggedOut={() => setAuth('anonymous')} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
