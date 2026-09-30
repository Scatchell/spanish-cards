import type { RequestHandler } from 'express';

// Stands in for requireAuth in route unit tests that mount a router directly.
export function asUser(userId: number): RequestHandler {
  return (req, _res, next) => {
    req.userId = userId;
    next();
  };
}
