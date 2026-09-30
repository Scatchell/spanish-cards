import { Router } from 'express';
import type { AppConfig } from '../config.js';
import type { DbPool } from '../db.js';
import { normalizeEmail } from '../users/email.js';
import {
  completeSetPassword,
  findUserByEmail,
  findUserById,
  findUserBySetPasswordToken,
  updatePassword,
} from '../users/repository.js';
import type { UserRecord } from '../users/repository.js';
import { hashSetPasswordToken } from '../users/set-password-token.js';
import type { AccountDeps } from './account-routes.js';
import { SESSION_COOKIE, issueSessionCookie } from './middleware.js';
import { dummyPasswordHash, hashPassword, validateNewPassword, verifyPassword } from './password.js';

export interface PublicAuthDeps {
  findUserByEmail: (email: string) => Promise<UserRecord | null>;
  findUserBySetPasswordToken: (tokenHash: string, now: Date) => Promise<UserRecord | null>;
  completeSetPassword: (tokenHash: string, passwordHash: string, now: Date) => Promise<UserRecord | null>;
}

export function userRepositoryDeps(pool: DbPool): PublicAuthDeps & AccountDeps {
  return {
    findUserByEmail: (email) => findUserByEmail(pool, email),
    findUserById: (id) => findUserById(pool, id),
    findUserBySetPasswordToken: (hash, now) => findUserBySetPasswordToken(pool, hash, now),
    completeSetPassword: (hash, passwordHash, now) => completeSetPassword(pool, hash, passwordHash, now),
    updatePassword: (id, passwordHash) => updatePassword(pool, id, passwordHash),
  };
}

const INVALID_LINK = 'This link is invalid or has expired';

function tokenFrom(body: unknown): string | null {
  const { token } = (body ?? {}) as { token?: unknown };
  return typeof token === 'string' && token.length > 0 && token.length <= 200 ? token : null;
}

// Routes reachable without a session. Everything else is mounted after the
// requireAuth guard in app.ts.
export function publicAuthRoutes(config: AppConfig, deps: PublicAuthDeps): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const normalized = typeof email === 'string' ? normalizeEmail(email) : '';
    const plain = typeof password === 'string' ? password : '';
    const user = normalized ? await deps.findUserByEmail(normalized) : null;
    // Always run one scrypt verification so timing doesn't reveal whether the
    // email exists or has a password yet.
    const matches = await verifyPassword(plain, user?.passwordHash ?? (await dummyPasswordHash()));
    if (!user || !user.passwordHash || !matches) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    issueSessionCookie(res, config, user);
    res.json({ ok: true });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  // POST (not GET /:token) keeps the token out of request logs.
  router.post('/set-password/check', async (req, res) => {
    const token = tokenFrom(req.body);
    const user = token ? await deps.findUserBySetPasswordToken(hashSetPasswordToken(token), new Date()) : null;
    if (!user) {
      res.status(404).json({ error: INVALID_LINK });
      return;
    }
    res.json({ email: user.email });
  });

  router.post('/set-password', async (req, res) => {
    const token = tokenFrom(req.body);
    const { password } = (req.body ?? {}) as { password?: unknown };
    if (!token) {
      res.status(404).json({ error: INVALID_LINK });
      return;
    }
    const passwordError = validateNewPassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    const user = await deps.completeSetPassword(
      hashSetPasswordToken(token),
      await hashPassword(password as string),
      new Date(),
    );
    if (!user) {
      res.status(404).json({ error: INVALID_LINK });
      return;
    }
    issueSessionCookie(res, config, user);
    res.json({ ok: true });
  });

  return router;
}
