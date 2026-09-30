import type { NextFunction, Request, RequestHandler, Response } from 'express';

// MCP has no per-user auth: every tool call acts as the single account named
// by MCP_USER_EMAIL. A found id is cached; a missing user is re-checked on the
// next request so creating the account later needs no restart.
export function createMcpUserResolver(
  lookup: (email: string) => Promise<number | null>,
  email: string | null,
): () => Promise<number | null> {
  let cached: number | null = null;
  return async () => {
    if (cached !== null) return cached;
    if (!email) return null;
    cached = await lookup(email);
    return cached;
  };
}

export function requireMcpUser(resolve: () => Promise<number | null>): RequestHandler {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    if ((await resolve()) === null) {
      res.status(503).json({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: 'MCP is not configured: set MCP_USER_EMAIL to an existing account (see .env.example)',
        },
        id: null,
      });
      return;
    }
    next();
  };
}
