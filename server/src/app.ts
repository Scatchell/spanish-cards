import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { requireAuth } from './auth/middleware.js';
import { authRoutes } from './auth/routes.js';
import { insertCards, listCards } from './cards/repository.js';
import { cardRoutes } from './cards/routes.js';
import { createExplanationGenerator } from './explanations/llm.js';
import { explanationRoutes } from './explanations/routes.js';
import { mcpRoutes } from './mcp/routes.js';
import { progressRoutes } from './progress/routes.js';
import { apiLimiter, loginLimiter, mcpLimiter } from './security/rate-limit.js';
import { trainingRoutes } from './training/routes.js';
import type { AppConfig } from './config.js';
import type { DbPool } from './db.js';

export function createApp(config: AppConfig, pool: DbPool): express.Express {
  const app = express();
  // The only thing that reaches us is a local proxy: cloudflared (loopback) for
  // external traffic, or NPM for the on-LAN path. Trust forwarded headers only
  // from loopback so per-IP rate limiting keys on the real visitor, not the
  // proxy, while off-box clients can't spoof X-Forwarded-For.
  app.set('trust proxy', 'loopback');
  // Security headers (HSTS, nosniff, frame-deny, no X-Powered-By). CSP is left
  // off for now — a strict policy needs tuning against the Vite bundle.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json());
  app.use(cookieParser());

  // Unauthenticated smoke check for deployments and container healthchecks.
  // Defined before the API rate limiter so frequent healthchecks never count
  // against it.
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api', apiLimiter);
  app.use('/api/login', loginLimiter);
  app.use('/api', authRoutes(config));
  app.use('/api/cards', requireAuth(config), cardRoutes(pool));
  app.use('/api/cards', requireAuth(config), explanationRoutes(pool, createExplanationGenerator(config)));
  app.use('/api/training', requireAuth(config), trainingRoutes(pool));
  app.use('/api/progress', requireAuth(config), progressRoutes(pool));

  // MCP (AI agent) access: bearer-token authenticated, separate from the
  // browser session. Tool handlers reuse the card domain functions directly.
  app.use(
    '/mcp',
    mcpLimiter,
    mcpRoutes(config.mcpToken, {
      listCards: () => listCards(pool),
      insertCards: (inputs) => insertCards(pool, inputs),
    }),
  );

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
