import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import { verifySessionToken } from './session-token.js';

export const SESSION_COOKIE = 'spanish_cards_session';

export function requireAuth(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!verifySessionToken(token, config.sessionSecret, Date.now())) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    next();
  };
}
