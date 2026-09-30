import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config.js';
import { createSessionToken, parseSessionToken } from './session-token.js';

export const SESSION_COOKIE = 'spanish_cards_session';
// Sliding expiry: an active user's cookie is refreshed at most once a day.
export const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export type SessionUserLookup = (
  userId: number,
) => Promise<{ id: number; sessionVersion: number } | null>;

export function issueSessionCookie(
  res: Response,
  config: AppConfig,
  user: { id: number; sessionVersion: number },
  nowMs: number = Date.now(),
): void {
  const expiresAtMs = nowMs + config.sessionTtlMs;
  const token = createSessionToken(
    { userId: user.id, sessionVersion: user.sessionVersion, expiresAtMs },
    config.sessionSecret,
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: config.sessionTtlMs,
  });
}

export function requireAuth(config: AppConfig, lookupUser: SessionUserLookup): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const nowMs = Date.now();
    const claims = parseSessionToken(req.cookies?.[SESSION_COOKIE] as string | undefined, config.sessionSecret, nowMs);
    const user = claims ? await lookupUser(claims.userId) : null;
    if (!claims || !user || user.sessionVersion !== claims.sessionVersion) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const issuedAtMs = claims.expiresAtMs - config.sessionTtlMs;
    if (nowMs - issuedAtMs > SESSION_REFRESH_AFTER_MS) {
      issueSessionCookie(res, config, user, nowMs);
    }
    req.userId = user.id;
    next();
  };
}

export function getUserId(req: Request): number {
  if (req.userId === undefined) {
    throw new Error('getUserId called on a route not behind requireAuth');
  }
  return req.userId;
}
