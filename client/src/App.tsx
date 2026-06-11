import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getMe } from './api.js';
import { LoginPage } from './auth/LoginPage.js';
import { CardsPage } from './cards/CardsPage.js';
import { TrainPage } from './training/TrainPage.js';

type AuthState = 'loading' | 'authenticated' | 'anonymous';

export function App() {
  const [auth, setAuth] = useState<AuthState>('loading');

  useEffect(() => {
    getMe()
      .then(() => setAuth('authenticated'))
      .catch(() => setAuth('anonymous'));
  }, []);

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
            <LoginPage onLogin={() => setAuth('authenticated')} />
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
        path="/train"
        element={
          auth === 'authenticated' ? (
            <TrainPage onLoggedOut={() => setAuth('anonymous')} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
