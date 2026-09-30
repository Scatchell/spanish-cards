import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { accountRoutes } from './auth/account-routes.js';
import { requireAuth } from './auth/middleware.js';
import { publicAuthRoutes, userRepositoryDeps } from './auth/routes.js';
import { insertCards, listCards } from './cards/repository.js';
import { cardRoutes } from './cards/routes.js';
import { categorizationRoutes } from './categorization/routes.js';
import {
  createAnswerCheckGenerator,
  createExplanationGenerator,
  createFollowUpGenerator,
} from './explanations/llm.js';
import { explanationRoutes } from './explanations/routes.js';
import { requestLogger } from './logging/request-log.js';
import { requireMcpToken } from './mcp/auth.js';
import { mcpRoutes } from './mcp/routes.js';
import { createMcpUserResolver, requireMcpUser } from './mcp/user.js';
import { createPracticeSentenceGenerator } from './practice/generator.js';
import { practiceRoutes } from './practice/routes.js';
import { progressRoutes } from './progress/routes.js';
import { apiLimiter, loginLimiter, mcpLimiter } from './security/rate-limit.js';
import { trainingRoutes } from './training/routes.js';
import type { AppConfig } from './config.js';
import { withTransaction } from './db.js';
import type { DbPool } from './db.js';

export function createApp(config: AppConfig, pool: DbPool): express.Express {
  const app = express();
  // The only thing that reaches us is a local proxy: cloudflared (loopback) for
  // external traffic, or NPM for the on-LAN path. Trust forwarded headers only
  // from loopback so per-IP rate limiting keys on the real visitor, not the
  // proxy, while off-box clients can't spoof X-Forwarded-For.
  app.set('trust proxy', 'loopback');
  app.use(requestLogger());
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
  app.use(['/api/login', '/api/set-password', '/api/password'], loginLimiter);

  const users = userRepositoryDeps(pool);
  // Public: the only /api routes reachable without a session.
  app.use('/api', publicAuthRoutes(config, users));
  // Everything mounted below this line requires a logged-in user.
  app.use('/api', requireAuth(config, (id) => users.findUserById(id)));

  app.use('/api', accountRoutes(config, users));
  app.use('/api/cards', cardRoutes(pool));
  app.use(
    '/api/cards',
    explanationRoutes(
      pool,
      createExplanationGenerator(config),
      createFollowUpGenerator(config),
      createAnswerCheckGenerator(config),
    ),
  );
  app.use('/api/training', trainingRoutes(pool));
  app.use('/api/progress', progressRoutes(pool));
  app.use('/api/categorization', categorizationRoutes(pool));
  app.use('/api/practice', practiceRoutes(pool, createPracticeSentenceGenerator(config)));

  // MCP (AI agent) access: bearer-token authenticated, separate from the
  // browser session, and locked to the one account named by MCP_USER_EMAIL.
  const mcpUserId = createMcpUserResolver(
    async (email) => (await users.findUserByEmail(email))?.id ?? null,
    config.mcpUserEmail,
  );
  // requireMcpUser has already guaranteed a resolved (cached) id when these run.
  const mcpUser = async () => (await mcpUserId())!;
  app.use(
    '/mcp',
    mcpLimiter,
    // Token check ahead of requireMcpUser so an unauthenticated caller can't
    // probe MCP_USER_EMAIL config state; mcpRoutes() re-checks the token too.
    ...(config.mcpToken ? [requireMcpToken(config.mcpToken)] : []),
    requireMcpUser(mcpUserId),
    mcpRoutes(config.mcpToken, {
      listCards: async () => listCards(pool, await mcpUser()),
      insertCards: async (inputs) => {
        const userId = await mcpUser();
        return withTransaction(pool, (tx) => insertCards(tx, userId, inputs));
      },
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
