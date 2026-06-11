import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth } from './auth/middleware.js';
import { authRoutes } from './auth/routes.js';
import { cardRoutes } from './cards/routes.js';
import { trainingRoutes } from './training/routes.js';
import type { AppConfig } from './config.js';
import type { DbPool } from './db.js';

export function createApp(config: AppConfig, pool: DbPool): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api', authRoutes(config));
  app.use('/api/cards', requireAuth(config), cardRoutes(pool));
  app.use('/api/training', requireAuth(config), trainingRoutes(pool));

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
