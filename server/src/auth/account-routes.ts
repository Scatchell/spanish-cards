import { Router } from 'express';
import type { AppConfig } from '../config.js';
import type { UserRecord } from '../users/repository.js';
import { getUserId, issueSessionCookie } from './middleware.js';
import { hashPassword, validateNewPassword, verifyPassword } from './password.js';

export interface AccountDeps {
  findUserById: (id: number) => Promise<UserRecord | null>;
  updatePassword: (id: number, passwordHash: string) => Promise<UserRecord | null>;
}

// Mounted after requireAuth: every handler can rely on getUserId(req).
export function accountRoutes(config: AppConfig, deps: AccountDeps): Router {
  const router = Router();

  router.get('/me', async (req, res) => {
    const user = await deps.findUserById(getUserId(req));
    res.json({ email: user!.email });
  });

  // Bumps session_version (signing out every other device) and re-issues this
  // device's cookie so the user stays logged in here.
  router.post('/password', async (req, res) => {
    const { currentPassword, newPassword } = (req.body ?? {}) as Record<string, unknown>;
    const user = await deps.findUserById(getUserId(req));
    const currentOk =
      typeof currentPassword === 'string' && !!user?.passwordHash && (await verifyPassword(currentPassword, user.passwordHash));
    if (!user || !currentOk) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    const updated = await deps.updatePassword(user.id, await hashPassword(newPassword as string));
    issueSessionCookie(res, config, updated!);
    res.json({ ok: true });
  });

  return router;
}
