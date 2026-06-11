import { Router } from 'express';
import type { AppConfig } from '../config.js';
import { checkCredentials } from './credentials.js';
import { SESSION_COOKIE, requireAuth } from './middleware.js';
import { createSessionToken } from './session-token.js';

export function authRoutes(config: AppConfig): Router {
  const router = Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const expected = { username: config.appUsername, password: config.appPassword };
    if (!checkCredentials(username, password, expected)) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    const expiresAtMs = Date.now() + config.sessionTtlMs;
    res.cookie(SESSION_COOKIE, createSessionToken(config.sessionSecret, expiresAtMs), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionTtlMs,
    });
    res.json({ ok: true });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth(config), (_req, res) => {
    res.json({ authenticated: true });
  });

  return router;
}
