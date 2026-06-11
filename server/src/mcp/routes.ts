import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireMcpToken } from './auth.js';
import { buildMcpServer } from './tools.js';
import type { McpDeps } from './tools.js';

// Streamable HTTP MCP endpoint. Stateless: each POST gets a fresh server +
// transport pair, so no session state survives between requests and clients
// never need a session id.
export function mcpRoutes(mcpToken: string | null, deps: McpDeps): Router {
  const router = Router();

  if (!mcpToken) {
    router.use((_req: Request, res: Response) => {
      res.status(503).json({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: 'MCP is not configured: set MCP_TOKEN in the server environment (see .env.example)',
        },
        id: null,
      });
    });
    return router;
  }

  router.use(requireMcpToken(mcpToken));

  router.post('/', async (req: Request, res: Response) => {
    const server = buildMcpServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('MCP request failed:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // Stateless transport: no SSE notification stream or sessions to terminate.
  router.all('/', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed: the MCP endpoint only accepts POST' },
      id: null,
    });
  });

  return router;
}
