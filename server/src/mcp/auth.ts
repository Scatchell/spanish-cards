import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Static bearer-token auth for the MCP endpoint. Deliberately independent of
// the browser session cookie; MCP clients authenticate with MCP_TOKEN only.
export function requireMcpToken(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      sendUnauthorized(res, 'Missing or malformed Authorization header; expected: Bearer <MCP_TOKEN>');
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (token.length === 0 || !tokensMatch(token, expectedToken)) {
      sendUnauthorized(res, 'Invalid MCP token');
      return;
    }
    next();
  };
}

function sendUnauthorized(res: Response, message: string): void {
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: `Unauthorized: ${message}` },
    id: null,
  });
}

// Hash both sides so the comparison is constant-time regardless of length.
function tokensMatch(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
